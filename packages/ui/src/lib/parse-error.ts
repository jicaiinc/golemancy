export function parseErrorMessage(error: Error): string {
  const msg = error.message
  const jsonMatch = msg.match(/^\d+:\s*(\{.+\})$/)
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
