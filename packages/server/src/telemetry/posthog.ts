import { NodeSDK } from '@opentelemetry/sdk-node'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { PostHogTraceExporter } from '@posthog/ai/otel'

let sdk: NodeSDK | null = null

export function initLLMAnalytics(apiKey: string, host: string): void {
  if (sdk) return
  sdk = new NodeSDK({
    resource: resourceFromAttributes({ 'service.name': 'golemancy-server' }),
    traceExporter: new PostHogTraceExporter({ apiKey, host }),
  })
  sdk.start()
}

export function shutdownLLMAnalytics(): Promise<void> {
  if (!sdk) return Promise.resolve()
  const timeout = new Promise<void>(r => setTimeout(r, 5000))
  return Promise.race([sdk.shutdown(), timeout])
}

export function isLLMAnalyticsInitialized(): boolean {
  return sdk !== null
}
