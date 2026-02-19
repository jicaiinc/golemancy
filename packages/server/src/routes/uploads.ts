import { Hono } from 'hono'
import type { ProjectId } from '@golemancy/shared'
import { validateId, validateFilePath } from '../utils/paths'
import { isValidUploadFilename, readUploadBuffer } from '../storage/uploads'
import { isNodeError } from '../storage/base'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:uploads' })

export function createUploadRoutes() {
  const app = new Hono()

  /**
   * GET /:filename — Serve an upload file.
   *
   * Security:
   * - Filename must match strict pattern: /^[a-f0-9]{32}\.\w+$/
   * - validateFilePath() prevents path traversal
   * - validateId() validates projectId format
   * - X-Content-Type-Options: nosniff prevents MIME sniffing
   * - Cache-Control: immutable (content-hashed filenames never change)
   * - Auth is enforced by the global middleware in app.ts
   */
  app.get('/:filename', async (c) => {
    const projectId = c.req.param('projectId') as string
    const filename = c.req.param('filename')

    // Validate projectId format
    try {
      validateId(projectId)
    } catch {
      return c.json({ error: 'Invalid project ID' }, 400)
    }

    // Strict filename validation
    if (!isValidUploadFilename(filename)) {
      return c.json({ error: 'Invalid filename' }, 400)
    }

    try {
      const { buffer, mediaType } = await readUploadBuffer(projectId as string, filename)

      c.header('Content-Type', mediaType)
      c.header('Content-Length', String(buffer.length))
      c.header('Cache-Control', 'public, max-age=31536000, immutable')
      c.header('X-Content-Type-Options', 'nosniff')

      return c.body(new Uint8Array(buffer))
    } catch (err) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        log.warn({ projectId, filename }, 'upload file not found')
        return c.json({ error: 'Not found' }, 404)
      }
      log.error({ err, projectId, filename }, 'failed to read upload file')
      throw err
    }
  })

  return app
}
