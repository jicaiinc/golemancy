import { eq } from 'drizzle-orm';
import type { GolemancyDb } from '../client.js';
import { projects, type NewProjectRow, type ProjectRow } from '../schema/projects.js';

export class ProjectsRepo {
  constructor(private readonly db: GolemancyDb) {}

  async list(): Promise<ProjectRow[]> {
    return this.db.select().from(projects).all();
  }

  async get(id: string): Promise<ProjectRow | undefined> {
    return this.db.select().from(projects).where(eq(projects.id, id)).get();
  }

  async insert(row: NewProjectRow): Promise<ProjectRow> {
    return this.db.insert(projects).values(row).returning().get();
  }
}
