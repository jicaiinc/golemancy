import { asc, eq } from 'drizzle-orm';
import type { GolemancyDb } from '../client.js';
import { messages, type MessageRow } from '../schema/messages.js';

export type NewMessage = {
  id: string;
  threadId: string;
  runId?: string | null;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  providerMetadata?: string | null;
};

export class MessagesRepo {
  constructor(private readonly db: GolemancyDb) {}

  async insert(row: NewMessage): Promise<MessageRow> {
    return this.db
      .insert(messages)
      .values({
        id: row.id,
        threadId: row.threadId,
        runId: row.runId ?? null,
        role: row.role,
        content: row.content,
        providerMetadata: row.providerMetadata ?? null,
      })
      .returning()
      .get();
  }

  async listByThread(threadId: string): Promise<MessageRow[]> {
    return this.db
      .select()
      .from(messages)
      .where(eq(messages.threadId, threadId))
      .orderBy(asc(messages.createdAt))
      .all();
  }
}
