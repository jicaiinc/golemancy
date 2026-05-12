import { desc, eq } from 'drizzle-orm';
import type { GolemancyDb } from '../client.js';
import { runs, type NewRunRow, type RunRow } from '../schema/runs.js';

export type RunCompletion = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
};

export class RunsRepo {
  constructor(private readonly db: GolemancyDb) {}

  async get(id: string): Promise<RunRow | undefined> {
    return this.db.select().from(runs).where(eq(runs.id, id)).get();
  }

  async insert(row: NewRunRow): Promise<RunRow> {
    await this.db.insert(runs).values(row).run();
    const out = await this.get(row.id);
    if (!out) throw new Error('runs.insert: row not visible after write');
    return out;
  }

  async listByThread(threadId: string, limit = 50): Promise<RunRow[]> {
    return this.db
      .select()
      .from(runs)
      .where(eq(runs.threadId, threadId))
      .orderBy(desc(runs.createdAt))
      .limit(limit)
      .all();
  }

  async listRecent(limit = 50): Promise<RunRow[]> {
    return this.db.select().from(runs).orderBy(desc(runs.createdAt)).limit(limit).all();
  }

  async markRunning(id: string): Promise<void> {
    await this.db
      .update(runs)
      .set({ status: 'running', startedAt: new Date().toISOString() })
      .where(eq(runs.id, id))
      .run();
  }

  async markCompleted(id: string, usage?: RunCompletion): Promise<void> {
    await this.db
      .update(runs)
      .set({
        status: 'completed',
        endedAt: new Date().toISOString(),
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        totalTokens: usage?.totalTokens ?? null,
      })
      .where(eq(runs.id, id))
      .run();
  }

  async markErrored(id: string, error: string): Promise<void> {
    await this.db
      .update(runs)
      .set({ status: 'errored', endedAt: new Date().toISOString(), error })
      .where(eq(runs.id, id))
      .run();
  }

  async markCancelled(id: string): Promise<void> {
    await this.db
      .update(runs)
      .set({ status: 'cancelled', endedAt: new Date().toISOString() })
      .where(eq(runs.id, id))
      .run();
  }
}
