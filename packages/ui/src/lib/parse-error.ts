export function parseErrorMessage(error: Error): string {
  const msg = error.message
  // AI SDK v6 DefaultChatTransport throws raw response body as error.message.
  // Match either raw JSON body or "STATUS: {json}" format.
  const jsonMatch = msg.match(/^(?:\d+:\s*)?(\{.+\})$/)
  if (jsonMatch) {
    try {
      const body = JSON.parse(jsonMatch[1])
      if (body.error && body.error !== 'Internal Server Error') {
        return body.error
      }
      return 'Something went wrong. Please try again later.'
    } catch { /* fall through */ }
  }
  return msg
}
