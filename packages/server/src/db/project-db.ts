import fs from 'node:fs'
import path from 'node:path'
import type { ProjectId } from '@golemancy/shared'
import { createDatabase, type AppDatabase } from './client'
import { migrateDatabase } from './migrate'
import { getProjectDbPath } from '../utils/paths'
import { assertProjectNotDeleted } from '../project-deletion'
import { logger } from '../logger'

const log = logger.child({ component: 'db:project' })

export class ProjectDbManager {
  private cache = new Map<string, AppDatabase>()

  getProjectDb = (projectId: ProjectId): AppDatabase => {
    assertProjectNotDeleted(projectId)

    const existing = this.cache.get(projectId)
    if (existing) return existing

    const dbPath = getProjectDbPath(projectId)
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })

    log.debug({ projectId, dbPath }, 'opening project database')
    const db = createDatabase(dbPath)
    migrateDatabase(db)

    this.cache.set(projectId, db)
    return db
  }

  closeProject(projectId: ProjectId) {
    const db = this.cache.get(projectId)
    if (!db) return
    if (this.closeDb(projectId, db)) {
      this.cache.delete(projectId)
    }
  }

  closeAll() {
    for (const [projectId, db] of this.cache) {
      if (this.closeDb(projectId, db)) {
        this.cache.delete(projectId)
      }
    }
  }

  /** Close the underlying better-sqlite3 connection (drizzle doesn't expose close directly) */
  private closeDb(projectId: string, db: AppDatabase): boolean {
    try {
      const client = (db as any).$client as { close?: () => void; pragma?: (sql: string) => unknown } | undefined
      if (!client?.close) {
        log.warn({ projectId }, 'project database client does not expose close()')
        return false
      }
      // Flush WAL to main database file before closing — prevents EBUSY on Windows
      // when the directory is deleted while -wal/-shm files are still held open.
      try {
        client.pragma?.('wal_checkpoint(TRUNCATE)')
      } catch (err) {
        log.warn({ projectId, err }, 'WAL checkpoint failed before close')
      }
      client.close()
      log.debug({ projectId }, 'closed project database')
      return true
    } catch {
      log.warn({ projectId }, 'failed to close project database')
      return false
    }
  }
}
