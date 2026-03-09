import crypto from 'node:crypto'

/** Generate a PKCE code verifier (64 random bytes, URL-safe base64). */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(64).toString('base64url')
}

/** Generate a PKCE code challenge (SHA-256 of verifier, URL-safe base64). */
export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

/** Generate a random state parameter (32 random bytes, URL-safe base64). */
export function generateState(): string {
  return crypto.randomBytes(32).toString('base64url')
}
