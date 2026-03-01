import i18next from 'i18next'

const SERVER_ERROR_CODE_RE = /^[A-Z][A-Z0-9_]+$/

export function parseErrorMessage(error: Error): string {
  const msg = error.message
  // AI SDK v6 DefaultChatTransport throws raw response body as error.message.
  // Match either raw JSON body or "STATUS: {json}" format.
  const jsonMatch = msg.match(/^(?:\d+:\s*)?(\{.+\})$/)
  if (jsonMatch) {
    try {
      const body = JSON.parse(jsonMatch[1])
      if (body.error && body.error !== 'Internal Server Error') {
        // Server error codes are UPPER_SNAKE_CASE — translate via i18n
        if (SERVER_ERROR_CODE_RE.test(body.error)) {
          return i18next.t(`error:server.${body.error}`)
        }
        return body.error
      }
      return i18next.t('error:fallback.generic')
    } catch { /* fall through */ }
  }
  return msg
}
