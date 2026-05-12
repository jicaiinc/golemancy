import { desc, eq } from 'drizzle-orm';
import type { GolemancyDb } from '../client.js';
import { projects, type NewProjectRow, type ProjectRow } from '../schema/projects.js';

export class ProjectsRepo {
  constructor(private readonly db: GolemancyDb) {}

  async list(): Promise<ProjectRow[]> {
    return this.db.select().from(projects).orderBy(desc(projects.updatedAt)).all();
  }

  async get(id: string): Promise<ProjectRow | undefined> {
    return this.db.select().from(projects).where(eq(projects.id, id)).get();
  }

  async insert(row: NewProjectRow): Promise<ProjectRow> {
    await this.db.insert(projects).values(row).run();
    const out = await this.get(row.id);
    if (!out) throw new Error('projects.insert: row not visible after write');
    return out;
  }

  async rename(id: string, name: string): Promise<ProjectRow | undefined> {
    await this.db
      .update(projects)
      .set({ name, updatedAt: nowIso() })
      .where(eq(projects.id, id))
      .run();
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(projects).where(eq(projects.id, id)).run();
  }
}

function nowIso(): string {
  return new Date().toISOString();
}
