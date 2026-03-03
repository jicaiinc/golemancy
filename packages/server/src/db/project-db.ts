import fs from 'node:fs'
import path from 'node:path'
import * as sqliteVec from 'sqlite-vec'
import type { ProjectId } from '@golemancy/shared'
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

    // Load sqlite-vec extension for vector search
    sqliteVec.load(db.$client)

    migrateDatabase(db)

    this.cache.set(projectId, db)
    return db
  }

  closeAll() {
    for (const [projectId, db] of this.cache) {
      try {
        db.$client.close()
        log.debug({ projectId }, 'closed project database')
      } catch {
        log.warn({ projectId }, 'failed to close project database')
      }
    }
    this.cache.clear()
  }
}
