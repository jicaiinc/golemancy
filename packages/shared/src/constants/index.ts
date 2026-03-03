export { DEFAULT_AGENT_SYSTEM_PROMPT } from './default-agent'

/** Default compact threshold in tokens (800K — ~80% of 1M context window) */
export const DEFAULT_COMPACT_THRESHOLD = 800_000

/** Default max steps (agentic round-trips) per streamText call */
export const DEFAULT_MAX_STEPS = 50

/** Default number of non-pinned memories auto-loaded into agent context */
export const DEFAULT_MEMORY_AUTO_LOAD = 20

/** Default priority for new memories (0-5 scale) */
export const DEFAULT_MEMORY_PRIORITY = 3

/** Priority range bounds */
export const MEMORY_PRIORITY_MIN = 0
export const MEMORY_PRIORITY_MAX = 5
