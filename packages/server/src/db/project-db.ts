import fs from 'node:fs'
import path from 'node:path'
import type { ProjectId } from '@solocraft/shared'
import { createDatabase, type AppDatabase } from './client'
import { migrateDatabase } from './migrate'
import { getProjectDbPath } from '../utils/paths'
import { logger } from '../logger'

const log = logger.child({ component: 'db:project' })

export class ProjectDbManager {
  private cache = new Map<string, AppDatabase>()

  getProjectDb = (projectId: ProjectId): AppDatabase => {
    const existing = this.cache.get(projectId)
    if (existing) return existing

    const dbPath = getProjectDbPath(projectId)
    const dir = path.dirname(dbPath)
    fs.mkdirSync(dir, { recursive: true })

    log.debug({ projectId, dbPath }, 'opening project database')
    const db = createDatabase(dbPath)
    migrateDatabase(db)

    this.cache.set(projectId, db)
    return db
  }

  closeAll() {
    for (const [projectId, db] of this.cache) {
      try {
        // Access the underlying better-sqlite3 instance to close it
        // drizzle wraps it but doesn't expose a close method directly
        ;(db as any)._.session.client.close()
        log.debug({ projectId }, 'closed project database')
      } catch {
        log.warn({ projectId }, 'failed to close project database')
      }
    }
    this.cache.clear()
  }
}
