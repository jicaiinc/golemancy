import { randomUUID } from 'node:crypto';
import {
  API_PATHS,
  CreateProjectRequestSchema,
  RenameProjectRequestSchema,
  type ListProjectsResponse,
  type ProjectSummary,
} from '@golemancy/protocol';
import type { Hono } from 'hono';
import type { RuntimeContext } from '../runtime-context.js';

export function registerProjectsRoutes(app: Hono, ctx: RuntimeContext): void {
  app.get(API_PATHS.projects, async (c) => {
    const rows = await ctx.repos.projects.list();
    const projects: ProjectSummary[] = rows.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
    const res: ListProjectsResponse = { projects };
    return c.json(res);
  });

  app.post(API_PATHS.projects, async (c) => {
    const json = await c.req.json().catch(() => null);
    const parsed = CreateProjectRequestSchema.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', detail: parsed.error.format() }, 400);
    }
    const row = await ctx.repos.projects.insert({
      id: randomUUID(),
      name: parsed.data.name,
    });
    const project: ProjectSummary = {
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    return c.json({ project }, 201);
  });

  app.patch('/projects/:id', async (c) => {
    const id = c.req.param('id');
    if (!id) return c.json({ error: 'missing_project_id' }, 400);
    const json = await c.req.json().catch(() => null);
    const parsed = RenameProjectRequestSchema.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', detail: parsed.error.format() }, 400);
    }
    const row = await ctx.repos.projects.rename(id, parsed.data.name);
    if (!row) return c.json({ error: 'not_found' }, 404);
    const project: ProjectSummary = {
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    return c.json({ project });
  });

  app.delete('/projects/:id', async (c) => {
    const id = c.req.param('id');
    if (!id) return c.json({ error: 'missing_project_id' }, 400);
    const existing = await ctx.repos.projects.get(id);
    if (!existing) return c.json({ error: 'not_found' }, 404);
    await ctx.repos.projects.remove(id);
    return c.json({ ok: true });
  });
}
