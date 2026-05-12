import { asc, eq } from 'drizzle-orm';
import type { GolemancyDb } from '../client.js';
import { runEvents, type RunEventRow } from '../schema/run-events.js';

export type NewRunEvent = {
  id: string;
  runId: string;
  sequence: number;
  type: string;
  payload: string;
  rawProvider?: string | null;
};

export class RunEventsRepo {
  constructor(private readonly db: GolemancyDb) {}

  async insert(row: NewRunEvent): Promise<void> {
    await this.db
      .insert(runEvents)
      .values({
        id: row.id,
        runId: row.runId,
        sequence: row.sequence,
        type: row.type,
        payload: row.payload,
        rawProvider: row.rawProvider ?? null,
      })
      .run();
  }

  async listByRun(runId: string): Promise<RunEventRow[]> {
    return this.db
      .select()
      .from(runEvents)
      .where(eq(runEvents.runId, runId))
      .orderBy(asc(runEvents.sequence))
      .all();
  }
}
