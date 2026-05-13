import type { MemoryId, AgentId, Timestamped } from './common'

export interface MemoryEntry extends Timestamped {
  id: MemoryId
  agentId: AgentId
  content: string
  pinned: boolean
  priority: number  // 0-5, default 3
  tags: string[]
}

export interface MemoryCreateData {
  content: string
  pinned?: boolean    // default: false
  priority?: number   // default: 3
  tags?: string[]     // default: []
}

export interface MemoryUpdateData {
  content?: string
  pinned?: boolean
  priority?: number   // 0-5
  tags?: string[]
}
