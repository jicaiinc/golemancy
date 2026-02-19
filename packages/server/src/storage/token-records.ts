import { sql } from 'drizzle-orm'
import type { ProjectId } from '@golemancy/shared'
import type { AppDatabase } from '../db/client'
import { generateId } from '../utils/ids'

export interface TokenRecordData {
  conversationId?: string
  messageId?: string
  agentId: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  source: 'chat' | 'cron' | 'sub-agent'
  parentRecordId?: string
  aborted?: boolean
}

export class TokenRecordStorage {
  constructor(private getProjectDb: (projectId: ProjectId) => AppDatabase) {}

  save(projectId: ProjectId, data: TokenRecordData): string {
    const db = this.getProjectDb(projectId)
    const id = generateId('tkr')
    const now = new Date().toISOString()

    db.run(sql`
      INSERT INTO token_records (id, conversation_id, message_id, agent_id, provider, model,
        input_tokens, output_tokens, source, parent_record_id, aborted, created_at)
      VALUES (${id}, ${data.conversationId ?? null}, ${data.messageId ?? null},
        ${data.agentId}, ${data.provider}, ${data.model},
        ${data.inputTokens}, ${data.outputTokens}, ${data.source},
        ${data.parentRecordId ?? null}, ${data.aborted ? 1 : 0}, ${now})
    `)

    return id
  }
}
