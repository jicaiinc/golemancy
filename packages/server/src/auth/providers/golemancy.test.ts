import { describe, it, expect } from 'vitest'
import type { OAuthProviderConfig } from '@golemancy/shared'
import { GOLEMANCY_OAUTH_CONFIG } from './golemancy'
import { CODEX_OAUTH_CONFIG } from './codex'

describe('GOLEMANCY_OAUTH_CONFIG', () => {
  it('uses authorization_code flow', () => {
    expect(GOLEMANCY_OAUTH_CONFIG.flowType).toBe('authorization_code')
  })

  it('targets locale-agnostic Web endpoints (no /[locale]/ prefix)', () => {
    expect(GOLEMANCY_OAUTH_CONFIG.authEndpoint).toBe('https://www.golemancy.ai/auth/desktop/authorize')
    expect(GOLEMANCY_OAUTH_CONFIG.tokenEndpoint).toBe('https://www.golemancy.ai/api/auth/desktop/token')
    expect(GOLEMANCY_OAUTH_CONFIG.authEndpoint).not.toMatch(/\/[a-z]{2}(?:-[A-Z]{2})?\//)
  })

  it('omits redirectUri so callback-server can use a dynamic port', () => {
    expect(GOLEMANCY_OAUTH_CONFIG.redirectUri).toBeUndefined()
  })

  it('omits callbackPort to opt into dynamic OS-assigned port (RFC 8252)', () => {
    expect(GOLEMANCY_OAUTH_CONFIG.callbackPort).toBeUndefined()
  })

  it('declares OpenAI-compatible chat completions sdkType (NOT codex-responses)', () => {
    expect(GOLEMANCY_OAUTH_CONFIG.sdkType).toBe('openai-compat')
    expect(GOLEMANCY_OAUTH_CONFIG.sdkType).not.toBe(CODEX_OAUTH_CONFIG.sdkType)
  })

  it('uses runtime Data Plane URL as apiBaseUrl, not the website host', () => {
    expect(GOLEMANCY_OAUTH_CONFIG.apiBaseUrl).toBe('https://runtime.golemancy.ai/v1')
    expect(GOLEMANCY_OAUTH_CONFIG.apiBaseUrl).not.toContain('www.golemancy.ai')
  })

  it('uses stable client identifier for log/audit correlation', () => {
    expect(GOLEMANCY_OAUTH_CONFIG.clientId).toBe('golemancy-desktop')
    expect(GOLEMANCY_OAUTH_CONFIG.clientId).not.toBe(CODEX_OAUTH_CONFIG.clientId)
  })

  it('survives JSON serialize → parse round-trip (important — config persisted in settings.json)', () => {
    const serialized = JSON.stringify(GOLEMANCY_OAUTH_CONFIG)
    const parsed = JSON.parse(serialized) as OAuthProviderConfig
    expect(parsed).toEqual(GOLEMANCY_OAUTH_CONFIG)
    // Confirm sdkType field survives — it's the new field we added.
    expect(parsed.sdkType).toBe('openai-compat')
  })
})

describe('CODEX_OAUTH_CONFIG (post-extension)', () => {
  it('still pins port 1455 — original behavior preserved', () => {
    expect(CODEX_OAUTH_CONFIG.callbackPort).toBe(1455)
    expect(CODEX_OAUTH_CONFIG.redirectUri).toBe('http://localhost:1455/auth/callback')
  })

  it('declares codex sdkType so the model resolver picks the Responses API branch', () => {
    expect(CODEX_OAUTH_CONFIG.sdkType).toBe('codex')
  })

  it('keeps Codex apiBaseUrl untouched', () => {
    expect(CODEX_OAUTH_CONFIG.apiBaseUrl).toBe('https://chatgpt.com/backend-api/codex')
  })
})
