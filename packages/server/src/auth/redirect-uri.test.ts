import { describe, it, expect } from 'vitest'
import type { OAuthProviderConfig } from '@golemancy/shared'
import { buildRedirectUri } from './redirect-uri'

const baseConfig: OAuthProviderConfig = {
  flowType: 'authorization_code',
  clientId: 'test',
  authEndpoint: 'https://example.com/authorize',
  tokenEndpoint: 'https://example.com/token',
  scope: 'api',
  apiBaseUrl: 'https://example.com/v1',
}

describe('buildRedirectUri', () => {
  it('returns config.redirectUri verbatim when set (Codex back-compat)', () => {
    const config: OAuthProviderConfig = {
      ...baseConfig,
      redirectUri: 'http://localhost:1455/auth/callback',
    }
    expect(buildRedirectUri(config, 54321)).toBe('http://localhost:1455/auth/callback')
  })

  it('builds 127.0.0.1 URL with default callback path when redirectUri is omitted', () => {
    expect(buildRedirectUri(baseConfig, 54321)).toBe('http://127.0.0.1:54321/auth/callback')
  })

  it('uses custom callbackPath when provided', () => {
    const config: OAuthProviderConfig = { ...baseConfig, callbackPath: '/custom/cb' }
    expect(buildRedirectUri(config, 4242)).toBe('http://127.0.0.1:4242/custom/cb')
  })

  it('redirectUri takes precedence over callbackPath', () => {
    const config: OAuthProviderConfig = {
      ...baseConfig,
      redirectUri: 'http://localhost:1455/auth/callback',
      callbackPath: '/should-be-ignored',
    }
    expect(buildRedirectUri(config, 99999)).toBe('http://localhost:1455/auth/callback')
  })

  it('produces identical strings on repeated calls (idempotent — required for token exchange)', () => {
    const a = buildRedirectUri(baseConfig, 8080)
    const b = buildRedirectUri(baseConfig, 8080)
    expect(a).toBe(b)
  })

  it('matches Golemancy dynamic-port flow shape', () => {
    const golemancyLike: OAuthProviderConfig = {
      ...baseConfig,
      clientId: 'golemancy-desktop',
      callbackPath: '/auth/callback',
    }
    const uri = buildRedirectUri(golemancyLike, 53412)
    expect(uri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/)
    expect(uri).toBe('http://127.0.0.1:53412/auth/callback')
  })
})
