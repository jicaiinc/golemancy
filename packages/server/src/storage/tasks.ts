import path from 'node:path'
import type { Task, TaskId, ProjectId, AgentId, TaskLogEntry, ITaskService } from '@solocraft/shared'
import { eq, sql, inArray } from 'drizzle-orm'
import type { AppDatabase } from '../db/client'
import * as schema from '../db/schema'
import { readJson, writeJson, listJsonFiles } from './base'
import { getProjectPath, validateId } from '../utils/paths'

export class FileTaskStorage implements ITaskService {
  constructor(private db: AppDatabase) {}

  private tasksDir(projectId: string) {
    return path.join(getProjectPath(projectId), 'tasks')
  }

  private taskPath(projectId: string, id: string) {
    validateId(id)
    return path.join(this.tasksDir(projectId), `${id}.json`)
  }

  async list(projectId: ProjectId, agentId?: AgentId): Promise<Task[]> {
    const tasks = await listJsonFiles<Task>(this.tasksDir(projectId))
    const filtered = agentId ? tasks.filter(t => t.agentId === agentId) : tasks

    if (filtered.length === 0) return filtered

    // Batch query all logs in a single query instead of N+1
    const taskIds = filtered.map(t => t.id as string)
    const allLogs = await this.db
      .select()
      .from(schema.taskLogs)
      .where(inArray(schema.taskLogs.taskId, taskIds))
      .orderBy(schema.taskLogs.id)

    const logsByTaskId = new Map<string, TaskLogEntry[]>()
    for (const row of allLogs) {
      const entries = logsByTaskId.get(row.taskId) ?? []
      entries.push({
        timestamp: row.timestamp,
        type: row.type as TaskLogEntry['type'],
        content: row.content,
        metadata: row.metadata as Record<string, unknown> | undefined,
      })
      logsByTaskId.set(row.taskId, entries)
    }

    return filtered.map(t => ({ ...t, log: logsByTaskId.get(t.id as string) ?? [] }))
  }

  async getById(projectId: ProjectId, id: TaskId): Promise<Task | null> {
    const task = await readJson<Task>(this.taskPath(projectId, id))
    if (!task) return null
    return this.attachLogs(task)
  }

  async cancel(projectId: ProjectId, id: TaskId): Promise<void> {
    const task = await readJson<Task>(this.taskPath(projectId, id))
    if (!task) throw new Error(`Task ${id} not found`)

    task.status = 'cancelled'
    task.completedAt = new Date().toISOString()
    task.updatedAt = new Date().toISOString()
    await writeJson(this.taskPath(projectId, id), task)
  }

  async getLogs(taskId: TaskId, cursor?: number, limit = 100): Promise<TaskLogEntry[]> {
    const condition = cursor
      ? sql`${schema.taskLogs.taskId} = ${taskId} AND ${schema.taskLogs.id} > ${cursor}`
      : eq(schema.taskLogs.taskId, taskId)

    const rows = await this.db
      .select()
      .from(schema.taskLogs)
      .where(condition)
      .orderBy(schema.taskLogs.id)
      .limit(limit)

    return rows.map(r => ({
      timestamp: r.timestamp,
      type: r.type as TaskLogEntry['type'],
      content: r.content,
      metadata: r.metadata as Record<string, unknown> | undefined,
    }))
  }

  private async attachLogs(task: Task): Promise<Task> {
    const logs = await this.getLogs(task.id as TaskId)
    return { ...task, log: logs }
  }
}
