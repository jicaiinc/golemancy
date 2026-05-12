import { eq } from 'drizzle-orm';
import type { GolemancyDb } from '../client.js';
import { runs, type NewRunRow, type RunRow } from '../schema/runs.js';

export class RunsRepo {
  constructor(private readonly db: GolemancyDb) {}

  async get(id: string): Promise<RunRow | undefined> {
    return this.db.select().from(runs).where(eq(runs.id, id)).get();
  }

  async insert(row: NewRunRow): Promise<RunRow> {
    return this.db.insert(runs).values(row).returning().get();
  }

  async updateStatus(id: string, status: RunRow['status']): Promise<void> {
    await this.db.update(runs).set({ status }).where(eq(runs.id, id)).run();
  }
}
