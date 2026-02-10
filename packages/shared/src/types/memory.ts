import type { MemoryId, ProjectId, Timestamped } from './common'

export interface MemoryEntry extends Timestamped {
  id: MemoryId
  projectId: ProjectId
  content: string
  source: string // which agent or user created it
  tags: string[]
}
