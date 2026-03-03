export { DEFAULT_AGENT_SYSTEM_PROMPT } from './default-agent'

/** Default compact threshold in tokens (800K — ~80% of 1M context window) */
export const DEFAULT_COMPACT_THRESHOLD = 800_000

/** Default max steps (agentic round-trips) per streamText call */
export const DEFAULT_MAX_STEPS = 50
