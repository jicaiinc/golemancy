import type { ProviderSdkType, OAuthProviderConfig } from '@golemancy/shared'

export interface ProviderPreset {
  name: string
  sdkType: ProviderSdkType
  defaultModels: string[]
  defaultBaseUrl?: string
  oauthConfig?: OAuthProviderConfig
}

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  anthropic: { name: 'Anthropic', sdkType: 'anthropic', defaultModels: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'] },
  openai: { name: 'OpenAI', sdkType: 'openai', defaultModels: ['gpt-5.2', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'o4-mini', 'o3'] },
  'openai-codex': {
    name: 'OpenAI Codex',
    sdkType: 'openai',
    defaultModels: ['gpt-5.4', 'gpt-5.3-codex', 'gpt-5.1-codex-mini'],
    oauthConfig: {
      flowType: 'authorization_code',
      clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
      authEndpoint: 'https://auth.openai.com/oauth/authorize',
      tokenEndpoint: 'https://auth.openai.com/oauth/token',
      redirectUri: 'http://localhost:1455/auth/callback',
      scope: 'openid profile email offline_access api.connectors.read api.connectors.invoke',
      apiBaseUrl: 'https://chatgpt.com/backend-api/codex',
    },
  },
  google: { name: 'Google', sdkType: 'google', defaultModels: ['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'] },
  deepseek: { name: 'DeepSeek', sdkType: 'deepseek', defaultModels: ['deepseek-chat', 'deepseek-reasoner'] },
  xai: { name: 'xAI (Grok)', sdkType: 'xai', defaultModels: ['grok-4', 'grok-4.1-fast', 'grok-4-code-fast-1'] },
  groq: { name: 'Groq', sdkType: 'groq', defaultModels: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'] },
  mistral: { name: 'Mistral', sdkType: 'mistral', defaultModels: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest', 'devstral-small-latest', 'codestral-latest'] },
  moonshot: { name: 'Moonshot (Kimi)', sdkType: 'moonshot', defaultModels: ['kimi-k2.5', 'kimi-k2-thinking'] },
  alibaba: { name: 'Alibaba (Qwen)', sdkType: 'alibaba', defaultModels: ['qwen3.5-plus', 'qwen3.5-flash', 'qwen-max'] },
}
