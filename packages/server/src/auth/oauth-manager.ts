import type { OAuthFlowState, OAuthTokens, GlobalSettings } from '@golemancy/shared'
import type { FileSettingsStorage } from '../storage/settings'
import { generateCodeVerifier, generateCodeChallenge, generateState } from './pkce'
import { startCallbackServer } from './callback-server'
import { CODEX_AUTH_EXTRA_PARAMS, CODEX_OAUTH_CONFIG } from './providers/codex'
import { buildRedirectUri } from './redirect-uri'
import { TokenRefreshScheduler } from './token-refresh'
import { logger } from '../logger'

const log = logger.child({ component: 'auth:oauth-manager' })

interface ActiveFlow {
  state: string
  codeVerifier: string
  /** redirect_uri sent in the authorize URL — must be reused verbatim during code exchange. */
  redirectUri: string
  close: () => void
}

export class OAuthManager {
  private activeFlows = new Map<string, ActiveFlow>()
  private flowStatus = new Map<string, OAuthFlowState>()
  private refreshScheduler = new TokenRefreshScheduler()
  private pendingRefresh = new Map<string, Promise<OAuthTokens>>()

  constructor(private settingsStorage: FileSettingsStorage) {}

  /** Initialize refresh schedules for existing OAuth providers on server startup. */
  async initializeRefreshSchedules(): Promise<void> {
    try {
      const settings = await this.settingsStorage.get()
      let needsUpdate = false
      const updatedProviders = { ...settings.providers }

      for (const [slug, entry] of Object.entries(settings.providers)) {
        if (entry.oauth?.refreshToken && entry.oauth.expiresAt) {
          this.refreshScheduler.scheduleRefresh(
            slug,
            entry.oauth.expiresAt,
            async () => { await this.refreshToken(slug) },
          )
          log.info({ slug }, 'scheduled token refresh for existing OAuth provider')
        }

        // Migration: ensure OAuth-connected providers have testStatus persisted
        if (entry.oauth?.accessToken && entry.testStatus !== 'ok') {
          updatedProviders[slug] = { ...entry, testStatus: 'ok' }
          needsUpdate = true
          log.info({ slug }, 'migrated OAuth provider testStatus to ok')
        }
      }

      if (needsUpdate) {
        await this.settingsStorage.update({ providers: updatedProviders })
      }
    } catch (err) {
      log.warn({ err }, 'failed to initialize OAuth refresh schedules')
    }
  }

  /**
   * Start an OAuth Authorization Code + PKCE flow for a provider.
   * Returns the authorization URL that the client should open in a browser.
   */
  async startFlow(slug: string): Promise<{ authUrl: string }> {
    // Cancel any existing flow for this slug
    this.cancelFlow(slug)

    const settings = await this.settingsStorage.get()
    const entry = settings.providers[slug]
    if (!entry?.oauthConfig) {
      throw new Error(`Provider "${slug}" has no OAuth config`)
    }

    const config = entry.oauthConfig
    const state = generateState()
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)

    // Codex back-compat: legacy persisted configs may lack `callbackPort`.
    // Detect by clientId and fall back to 1455; everything else gets dynamic (0).
    const isCodex = config.clientId === CODEX_OAUTH_CONFIG.clientId
    const port = config.callbackPort ?? (isCodex ? 1455 : 0)

    const { promise: callbackPromise, close, listening } = startCallbackServer(state, { port })
    let actualPort: number
    try {
      actualPort = await listening
    } catch (err) {
      close()
      this.flowStatus.set(slug, { status: 'error', error: err instanceof Error ? err.message : String(err) })
      throw err
    }

    const redirectUri = buildRedirectUri(config, actualPort)

    this.activeFlows.set(slug, { state, codeVerifier, redirectUri, close })
    this.flowStatus.set(slug, { status: 'pending' })

    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: config.scope,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      ...(isCodex ? CODEX_AUTH_EXTRA_PARAMS : {}),
    })
    const authUrl = `${config.authEndpoint}?${params}`

    log.info({ slug, port: actualPort, dynamicPort: port === 0 }, 'OAuth flow started')

    // Background: wait for callback, exchange code for token
    callbackPromise
      .then(async ({ code }) => {
        log.info({ slug }, 'received OAuth callback, exchanging code for token')
        await this.exchangeCodeForToken(slug, code, codeVerifier, redirectUri)
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err)
        if (!message.includes('cancelled')) {
          log.error({ slug, error: message }, 'OAuth flow failed')
          this.flowStatus.set(slug, { status: 'error', error: message })
        } else {
          this.flowStatus.set(slug, { status: 'idle' })
        }
      })
      .finally(() => {
        this.activeFlows.delete(slug)
      })

    return { authUrl }
  }

  /** Get the current flow status for a provider. */
  getFlowStatus(slug: string): OAuthFlowState {
    return this.flowStatus.get(slug) ?? { status: 'idle' }
  }

  /** Cancel an in-progress OAuth flow. */
  cancelFlow(slug: string): void {
    const flow = this.activeFlows.get(slug)
    if (flow) {
      flow.close()
      this.activeFlows.delete(slug)
      this.flowStatus.set(slug, { status: 'idle' })
      log.info({ slug }, 'OAuth flow cancelled')
    }
  }

  /** Clear OAuth tokens and disconnect. */
  async disconnect(slug: string): Promise<void> {
    this.cancelFlow(slug)
    this.refreshScheduler.cancelRefresh(slug)

    const settings = await this.settingsStorage.get()
    const entry = settings.providers[slug]
    if (entry) {
      const { oauth: _, testStatus: __, ...rest } = entry
      const updated = { ...settings }
      updated.providers = { ...updated.providers, [slug]: { ...rest, testStatus: 'untested' as const } }
      await this.settingsStorage.update({ providers: updated.providers })
      this.flowStatus.set(slug, { status: 'idle' })
      log.info({ slug }, 'OAuth disconnected')
    }
  }

  /**
   * Get a valid access token for a provider, refreshing if needed.
   * Called at model resolution time (runtime).
   */
  async getValidToken(slug: string): Promise<string> {
    const settings = await this.settingsStorage.get()
    const entry = settings.providers[slug]
    if (!entry?.oauth?.accessToken) {
      throw new Error(`No OAuth token for provider "${slug}"`)
    }

    // Check if token is expiring within 2 minutes
    const expiresAt = new Date(entry.oauth.expiresAt).getTime()
    const now = Date.now()
    if (expiresAt - now < 2 * 60 * 1000) {
      log.info({ slug }, 'token expiring soon, refreshing')
      const refreshed = await this.refreshToken(slug)
      return refreshed.accessToken
    }

    return entry.oauth.accessToken
  }

  /** Refresh the OAuth token for a provider (with Promise coalescing to prevent concurrent refreshes). */
  async refreshToken(slug: string): Promise<OAuthTokens> {
    // Coalesce concurrent refresh requests for the same provider
    const pending = this.pendingRefresh.get(slug)
    if (pending) {
      log.debug({ slug }, 'reusing in-flight token refresh')
      return pending
    }

    const refreshPromise = this.doRefreshToken(slug).finally(() => {
      this.pendingRefresh.delete(slug)
    })
    this.pendingRefresh.set(slug, refreshPromise)
    return refreshPromise
  }

  private async doRefreshToken(slug: string): Promise<OAuthTokens> {
    const settings = await this.settingsStorage.get()
    const entry = settings.providers[slug]
    if (!entry?.oauth?.refreshToken || !entry.oauthConfig) {
      throw new Error(`Cannot refresh: no refresh token for provider "${slug}"`)
    }

    const config = entry.oauthConfig

    log.info({ slug }, 'refreshing OAuth token')

    const response = await fetch(config.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.clientId,
        grant_type: 'refresh_token',
        refresh_token: entry.oauth.refreshToken,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      log.error({ slug, status: response.status, body }, 'token refresh failed')

      // Clear OAuth on refresh failure — token may be revoked
      await this.disconnect(slug)
      throw new Error(`Token refresh failed: ${response.status} — please re-authenticate`)
    }

    const data = await response.json() as {
      access_token: string
      refresh_token?: string
      id_token?: string
      expires_in?: number
    }

    const tokens: OAuthTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? entry.oauth.refreshToken,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
      accountId: entry.oauth.accountId,
    }

    // Parse accountId from id_token if present
    if (data.id_token) {
      try {
        const payload = JSON.parse(
          Buffer.from(data.id_token.split('.')[1], 'base64url').toString(),
        )
        if (payload.chatgpt_account_id) {
          tokens.accountId = payload.chatgpt_account_id
        }
      } catch {
        // id_token parsing is best-effort
      }
    }

    // Save updated tokens
    await this.saveTokens(slug, tokens)

    // Reschedule refresh
    this.refreshScheduler.scheduleRefresh(
      slug,
      tokens.expiresAt,
      async () => { await this.refreshToken(slug) },
    )

    log.info({ slug, expiresAt: tokens.expiresAt }, 'token refreshed successfully')
    return tokens
  }

  /** Shut down the manager (cancel all flows and refresh timers). */
  shutdown(): void {
    for (const [slug, flow] of this.activeFlows) {
      flow.close()
      log.debug({ slug }, 'cancelled active OAuth flow on shutdown')
    }
    this.activeFlows.clear()
    this.refreshScheduler.shutdown()
  }

  // --- Private ---

  private async exchangeCodeForToken(
    slug: string,
    code: string,
    codeVerifier: string,
    redirectUri: string,
  ): Promise<void> {
    const settings = await this.settingsStorage.get()
    const entry = settings.providers[slug]
    if (!entry?.oauthConfig) {
      throw new Error(`Provider "${slug}" has no OAuth config`)
    }

    const config = entry.oauthConfig

    const response = await fetch(config.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Token exchange failed: ${response.status} — ${body}`)
    }

    const data = await response.json() as {
      access_token: string
      refresh_token: string
      id_token?: string
      expires_in?: number
    }

    const tokens: OAuthTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
    }

    // Parse accountId from id_token if present
    if (data.id_token) {
      try {
        const payload = JSON.parse(
          Buffer.from(data.id_token.split('.')[1], 'base64url').toString(),
        )
        if (payload.chatgpt_account_id) {
          tokens.accountId = payload.chatgpt_account_id
        }
      } catch {
        // id_token parsing is best-effort
      }
    }

    // Save tokens to settings
    await this.saveTokens(slug, tokens)

    // Schedule token refresh
    this.refreshScheduler.scheduleRefresh(
      slug,
      tokens.expiresAt,
      async () => { await this.refreshToken(slug) },
    )

    this.flowStatus.set(slug, { status: 'success' })
    log.info({ slug, expiresAt: tokens.expiresAt, hasAccountId: !!tokens.accountId }, 'OAuth flow completed')
  }

  private async saveTokens(slug: string, tokens: OAuthTokens): Promise<void> {
    const settings = await this.settingsStorage.get()
    const entry = settings.providers[slug]
    if (!entry) return

    const updated: GlobalSettings = {
      ...settings,
      providers: {
        ...settings.providers,
        [slug]: { ...entry, oauth: tokens, testStatus: 'ok' },
      },
    }
    await this.settingsStorage.update({ providers: updated.providers })
  }
}
