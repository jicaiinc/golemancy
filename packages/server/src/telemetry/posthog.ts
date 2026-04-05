import { PostHog } from 'posthog-node'

let client: PostHog | null = null

export function initLLMAnalytics(apiKey: string, host: string): void {
  if (client) return
  client = new PostHog(apiKey, { host, flushAt: 10, flushInterval: 5000 })
}

export function getLLMAnalyticsClient(): PostHog | null {
  return client
}

export async function shutdownLLMAnalytics(): Promise<void> {
  if (!client) return
  await client.shutdown()
  client = null
}
