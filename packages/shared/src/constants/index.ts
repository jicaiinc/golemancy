export { DEFAULT_AGENT_SYSTEM_PROMPT } from './default-agent'

export const APP_VERSION = '0.1.0'

/** Default compact threshold in tokens (800K — ~80% of 1M context window) */
export const DEFAULT_COMPACT_THRESHOLD = 800_000

export const CLAUDE_CODE_MODELS = [
  { id: 'sonnet', label: 'Claude Sonnet' },
  { id: 'opus', label: 'Claude Opus' },
  { id: 'haiku', label: 'Claude Haiku' },
] as const

export const DEFAULT_CLAUDE_CODE_MODEL = 'sonnet'
