import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { generateCodeVerifier, generateCodeChallenge, generateState } from './pkce'

describe('PKCE utilities', () => {
  it('generateCodeVerifier returns URL-safe base64 string of expected length', () => {
    const verifier = generateCodeVerifier()
    // 64 bytes → base64url = ceil(64 * 4/3) ≈ 86 chars
    expect(verifier.length).toBeGreaterThanOrEqual(80)
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('generateCodeVerifier returns unique values', () => {
    const a = generateCodeVerifier()
    const b = generateCodeVerifier()
    expect(a).not.toBe(b)
  })

  it('generateCodeChallenge returns SHA-256 URL-safe base64 of verifier', () => {
    const verifier = 'test-verifier-value'
    const challenge = generateCodeChallenge(verifier)
    // Manually compute expected
    const expected = crypto.createHash('sha256').update(verifier).digest('base64url')
    expect(challenge).toBe(expected)
  })

  it('generateCodeChallenge is deterministic', () => {
    const verifier = generateCodeVerifier()
    const a = generateCodeChallenge(verifier)
    const b = generateCodeChallenge(verifier)
    expect(a).toBe(b)
  })

  it('generateState returns URL-safe base64 string', () => {
    const state = generateState()
    // 32 bytes → base64url = ceil(32 * 4/3) ≈ 43 chars
    expect(state.length).toBeGreaterThanOrEqual(40)
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('generateState returns unique values', () => {
    const a = generateState()
    const b = generateState()
    expect(a).not.toBe(b)
  })
})
