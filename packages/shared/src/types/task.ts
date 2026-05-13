import type { ConversationId, TaskId, Timestamped } from './common'

export type ConversationTaskStatus = 'pending' | 'in_progress' | 'completed' | 'deleted'

export interface ConversationTask extends Timestamped {
  id: TaskId
  conversationId: ConversationId
  subject: string
  description: string
  status: ConversationTaskStatus
  activeForm?: string
  owner?: string
  metadata?: Record<string, unknown>
  blocks: TaskId[]
  blockedBy: TaskId[]
}
