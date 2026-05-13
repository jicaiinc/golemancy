import { Hono } from 'hono'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { WorkspaceEntry, FilePreviewData } from '@golemancy/shared'
import { getFileCategory, getMimeType } from '@golemancy/shared'
import { getProjectPath, validateFilePath } from '../utils/paths'
import { isNodeError } from '../storage/base'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:workspace' })

const MAX_TEXT_PREVIEW_SIZE = 512 * 1024  // 512 KB — don't load huge text files
const MAX_CSV_ROWS = 200

function getWorkspacePath(projectId: string): string {
  return path.join(getProjectPath(projectId), 'workspace')
}

export function createWorkspaceRoutes() {
  const app = new Hono()

  // GET / — List directory entries
  // Query: ?path=subdir/nested (relative to workspace root, default "")
  app.get('/', async (c) => {
    const projectId = c.req.param('projectId') as string
    const dirPath = c.req.query('path') ?? ''
    const wsRoot = getWorkspacePath(projectId)

    // Ensure workspace directory exists
    await fs.mkdir(wsRoot, { recursive: true })

    const targetDir = validateFilePath(wsRoot, dirPath || '.')
    log.debug({ projectId, dirPath, targetDir }, 'listing workspace directory')

    try {
      const entries = await fs.readdir(targetDir, { withFileTypes: true })
      const result: WorkspaceEntry[] = []

      for (const entry of entries) {
        // Skip hidden files
        if (entry.name.startsWith('.')) continue

        const fullPath = path.join(targetDir, entry.name)
        const relativePath = path.relative(wsRoot, fullPath).split(path.sep).join('/')

        if (entry.isDirectory()) {
          result.push({
            name: relativePath,
            type: 'directory',
            size: 0,
            modifiedAt: (await fs.stat(fullPath)).mtime.toISOString(),
          })
        } else if (entry.isFile()) {
          const stat = await fs.stat(fullPath)
          result.push({
            name: relativePath,
            type: 'file',
            size: stat.size,
            modifiedAt: stat.mtime.toISOString(),
            category: getFileCategory(entry.name),
          })
        }
      }

      // Sort: directories first, then alphabetical
      result.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      return c.json(result)
    } catch (e) {
      if (isNodeError(e) && e.code === 'ENOENT') return c.json([])
      throw e
    }
  })

  // GET /file — Read file for preview
  // Query: ?path=subdir/file.txt
  app.get('/file', async (c) => {
    const projectId = c.req.param('projectId') as string
    const filePath = c.req.query('path')
    if (!filePath) return c.json({ error: 'PATH_REQUIRED' }, 400)

    const wsRoot = getWorkspacePath(projectId)
    const fullPath = validateFilePath(wsRoot, filePath)

    log.debug({ projectId, filePath }, 'reading workspace file')

    try {
      const stat = await fs.stat(fullPath)
      if (!stat.isFile()) return c.json({ error: 'NOT_A_FILE' }, 400)

      const filename = path.basename(filePath)
      const ext = filename.split('.').pop()?.toLowerCase() ?? ''
      const category = getFileCategory(filename)
      const mimeType = getMimeType(filename)

      const base: Omit<FilePreviewData, 'content'> = {
        path: filePath,
        category,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        mimeType,
        extension: ext,
        absolutePath: fullPath,
      }

      // Tier 1: code/text → read text content
      if (category === 'code' || category === 'text') {
        if (stat.size > MAX_TEXT_PREVIEW_SIZE) {
          // Too large — return truncated
          const fd = await fs.open(fullPath, 'r')
          const buf = Buffer.alloc(MAX_TEXT_PREVIEW_SIZE)
          await fd.read(buf, 0, MAX_TEXT_PREVIEW_SIZE, 0)
          await fd.close()
          const textContent = buf.toString('utf-8') + '\n\n... (truncated, file too large for preview)'

          const result: FilePreviewData = { ...base, content: textContent }

          // CSV/TSV parsing for truncated doesn't make sense
          return c.json(result)
        }

        const textContent = await fs.readFile(fullPath, 'utf-8')
        const result: FilePreviewData = { ...base, content: textContent }

        // Parse CSV/TSV
        if (ext === 'csv' || ext === 'tsv') {
          const separator = ext === 'tsv' ? '\t' : ','
          const rows = textContent.split('\n')
            .slice(0, MAX_CSV_ROWS)
            .map(row => row.split(separator))
          result.csvRows = rows
        }

        return c.json(result)
      }

      // Tier 1: image → return imageUrl (client will fetch via /raw endpoint)
      if (category === 'image') {
        const imageUrl = `/api/projects/${projectId}/workspace/raw?path=${encodeURIComponent(filePath)}`
        return c.json({ ...base, content: null, imageUrl } satisfies FilePreviewData)
      }

      // Tier 2: everything else — meta only
      return c.json({ ...base, content: null } satisfies FilePreviewData)

    } catch (e) {
      if (isNodeError(e) && e.code === 'ENOENT') return c.json({ error: 'FILE_NOT_FOUND' }, 404)
      throw e
    }
  })

  // GET /raw — Serve raw file bytes (for images, downloads)
  // Query: ?path=subdir/image.png
  app.get('/raw', async (c) => {
    const projectId = c.req.param('projectId') as string
    const filePath = c.req.query('path')
    if (!filePath) return c.json({ error: 'PATH_REQUIRED' }, 400)

    const wsRoot = getWorkspacePath(projectId)
    const fullPath = validateFilePath(wsRoot, filePath)

    try {
      const stat = await fs.stat(fullPath)
      if (!stat.isFile()) return c.json({ error: 'NOT_A_FILE' }, 400)

      const buffer = await fs.readFile(fullPath)
      const mimeType = getMimeType(path.basename(filePath))

      c.header('Content-Type', mimeType)
      c.header('Content-Length', String(buffer.length))
      c.header('X-Content-Type-Options', 'nosniff')

      return c.body(new Uint8Array(buffer))
    } catch (e) {
      if (isNodeError(e) && e.code === 'ENOENT') return c.json({ error: 'FILE_NOT_FOUND' }, 404)
      throw e
    }
  })

  // DELETE /file — Delete a file
  // Query: ?path=subdir/file.txt
  app.delete('/file', async (c) => {
    const projectId = c.req.param('projectId') as string
    const filePath = c.req.query('path')
    if (!filePath) return c.json({ error: 'PATH_REQUIRED' }, 400)

    const wsRoot = getWorkspacePath(projectId)
    const fullPath = validateFilePath(wsRoot, filePath)

    log.debug({ projectId, filePath }, 'deleting workspace file')

    try {
      const stat = await fs.stat(fullPath)
      if (stat.isDirectory()) {
        // Only delete empty directories
        const entries = await fs.readdir(fullPath)
        if (entries.length > 0) {
          return c.json({ error: 'DIRECTORY_NOT_EMPTY' }, 400)
        }
        await fs.rmdir(fullPath)
      } else {
        await fs.unlink(fullPath)
      }
      return c.json({ ok: true })
    } catch (e) {
      if (isNodeError(e) && e.code === 'ENOENT') return c.json({ error: 'FILE_NOT_FOUND' }, 404)
      throw e
    }
  })

  return app
}
