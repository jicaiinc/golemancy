import type { ProviderSdkType } from '@golemancy/shared'

export const PROVIDER_PRESETS: Record<string, { name: string; sdkType: ProviderSdkType; defaultModels: string[]; defaultBaseUrl?: string }> = {
  anthropic: { name: 'Anthropic', sdkType: 'anthropic', defaultModels: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-6'] },
  openai: { name: 'OpenAI', sdkType: 'openai', defaultModels: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'] },
  google: { name: 'Google', sdkType: 'google', defaultModels: ['gemini-2.5-flash', 'gemini-2.5-pro'] },
  deepseek: { name: 'DeepSeek', sdkType: 'deepseek', defaultModels: ['deepseek-chat', 'deepseek-reasoner'] },
  xai: { name: 'xAI (Grok)', sdkType: 'xai', defaultModels: ['grok-3', 'grok-3-mini'] },
  groq: { name: 'Groq', sdkType: 'groq', defaultModels: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'] },
  mistral: { name: 'Mistral', sdkType: 'mistral', defaultModels: ['mistral-large-latest', 'codestral-latest'] },
  moonshot: { name: 'Moonshot (Kimi)', sdkType: 'moonshot', defaultModels: ['kimi-k2', 'moonshot-v1-128k'] },
  alibaba: { name: 'Alibaba (Qwen)', sdkType: 'alibaba', defaultModels: ['qwen-max', 'qwen-plus', 'qwen-turbo'] },
}
