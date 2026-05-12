import { desc, eq } from 'drizzle-orm';
import type { GolemancyDb } from '../client.js';
import { threads, type ThreadRow } from '../schema/threads.js';

export class ThreadsRepo {
  constructor(private readonly db: GolemancyDb) {}

  async list(): Promise<ThreadRow[]> {
    return this.db.select().from(threads).orderBy(desc(threads.updatedAt)).all();
  }

  async listByProject(projectId: string): Promise<ThreadRow[]> {
    return this.db
      .select()
      .from(threads)
      .where(eq(threads.projectId, projectId))
      .orderBy(desc(threads.updatedAt))
      .all();
  }

  async get(id: string): Promise<ThreadRow | undefined> {
    return this.db.select().from(threads).where(eq(threads.id, id)).get();
  }

  async insert(row: {
    id: string;
    projectId?: string | null;
    title?: string | null;
  }): Promise<ThreadRow> {
    await this.db
      .insert(threads)
      .values({
        id: row.id,
        projectId: row.projectId ?? null,
        title: row.title ?? null,
      })
      .run();
    const out = await this.get(row.id);
    if (!out) throw new Error('threads.insert: row not visible after write');
    return out;
  }

  async setTitle(id: string, title: string): Promise<void> {
    await this.db
      .update(threads)
      .set({ title, updatedAt: nowIso() })
      .where(eq(threads.id, id))
      .run();
  }

  async rename(id: string, title: string): Promise<ThreadRow | undefined> {
    await this.db
      .update(threads)
      .set({ title, updatedAt: nowIso() })
      .where(eq(threads.id, id))
      .run();
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(threads).where(eq(threads.id, id)).run();
  }

  async touch(id: string): Promise<void> {
    await this.db.update(threads).set({ updatedAt: nowIso() }).where(eq(threads.id, id)).run();
  }
}

function nowIso(): string {
  return new Date().toISOString();
}
