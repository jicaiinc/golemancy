import type { ToolSet } from 'ai'

/** Result returned by all tool creators (browser, computer-use, etc.) */
export interface ToolsResult {
  tools: ToolSet
  cleanup: () => Promise<void>
}
