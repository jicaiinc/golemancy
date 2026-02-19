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

export interface ConversationTokenUsage {
  total: { inputTokens: number; outputTokens: number }
  byAgent: Array<{ agentId: string; inputTokens: number; outputTokens: number }>
  byModel: Array<{ provider: string; model: string; inputTokens: number; outputTokens: number }>
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

  getConversationUsage(projectId: ProjectId, conversationId: string): ConversationTokenUsage {
    const db = this.getProjectDb(projectId)

    const totalRows = db.all<{ inp: number; out: number }>(sql`
      SELECT COALESCE(SUM(input_tokens), 0) as inp, COALESCE(SUM(output_tokens), 0) as out
      FROM token_records WHERE conversation_id = ${conversationId}
    `)

    const byAgentRows = db.all<{ agent_id: string; inp: number; out: number }>(sql`
      SELECT agent_id, SUM(input_tokens) as inp, SUM(output_tokens) as out
      FROM token_records WHERE conversation_id = ${conversationId}
      GROUP BY agent_id
    `)

    const byModelRows = db.all<{ provider: string; model: string; inp: number; out: number }>(sql`
      SELECT provider, model, SUM(input_tokens) as inp, SUM(output_tokens) as out
      FROM token_records WHERE conversation_id = ${conversationId}
      GROUP BY provider, model
    `)

    return {
      total: {
        inputTokens: totalRows[0]?.inp ?? 0,
        outputTokens: totalRows[0]?.out ?? 0,
      },
      byAgent: byAgentRows.map(r => ({
        agentId: r.agent_id,
        inputTokens: r.inp,
        outputTokens: r.out,
      })),
      byModel: byModelRows.map(r => ({
        provider: r.provider,
        model: r.model,
        inputTokens: r.inp,
        outputTokens: r.out,
      })),
    }
  }
}
