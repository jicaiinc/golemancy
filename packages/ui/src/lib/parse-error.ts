import i18next from 'i18next'

const SERVER_ERROR_CODE_RE = /^[A-Z][A-Z0-9_]+$/

export interface ParsedError {
  message: string
  code?: string
}

export function parseErrorMessage(error: Error): ParsedError {
  const msg = error.message
  // AI SDK v6 DefaultChatTransport throws raw response body as error.message.
  // Match either raw JSON body or "STATUS: {json}" format.
  const jsonMatch = msg.match(/^(?:\d+:\s*)?(\{.+\})$/)
  if (jsonMatch) {
    try {
      const body = JSON.parse(jsonMatch[1])
      // Prefer body.code for i18n lookup (ConfigurationError etc.)
      // Pass extra fields (e.g. provider) as interpolation params
      if (body.code && SERVER_ERROR_CODE_RE.test(body.code)) {
        const { error: _e, code: _c, ...meta } = body
        return { message: i18next.t(`error:server.${body.code}`, meta) as string, code: body.code }
      }
      if (body.error && body.error !== 'Internal Server Error') {
        // Server error codes are UPPER_SNAKE_CASE — translate via i18n
        if (SERVER_ERROR_CODE_RE.test(body.error)) {
          return { message: i18next.t(`error:server.${body.error}`), code: body.error }
        }
        return { message: body.error }
      }
      return { message: i18next.t('error:fallback.generic') }
    } catch { /* fall through */ }
  }
  return { message: msg }
}
