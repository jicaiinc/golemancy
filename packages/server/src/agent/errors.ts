import type { PermissionMode } from '@golemancy/shared'

export class ConfigurationError extends Error {
  readonly name = 'ConfigurationError' as const
  readonly statusCode: number
  readonly code: string
  readonly meta?: Record<string, string>

  constructor(message: string, code: string, statusCode = 422, meta?: Record<string, string>) {
    super(message)
    this.code = code
    this.statusCode = statusCode
    this.meta = meta
  }
}

/**
 * Error thrown when sandbox mode is requested but unavailable.
 * Instead of silently falling back, this error is thrown so the caller
 * can notify the user about the degradation.
 */
export class SandboxUnavailableError extends Error {
  readonly name = 'SandboxUnavailableError' as const
  readonly requestedMode: PermissionMode
  readonly fallbackMode: PermissionMode

  constructor(
    message: string,
    requestedMode: PermissionMode = 'sandbox',
    fallbackMode: PermissionMode = 'restricted',
  ) {
    super(message)
    this.requestedMode = requestedMode
    this.fallbackMode = fallbackMode
  }
}
