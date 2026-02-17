import type { PermissionMode } from '@golemancy/shared'

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
