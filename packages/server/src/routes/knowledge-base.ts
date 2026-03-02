import { Hono } from 'hono'
import type { ProjectId, KBCollectionId, KBDocumentId } from '@golemancy/shared'
import type { KnowledgeBaseStorage } from '../storage/knowledge-base'
import { parseFile } from '../agent/file-parser'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:knowledge-base' })

export function createKnowledgeBaseRoutes(storage: KnowledgeBaseStorage) {
  const app = new Hono()

  // ── Collections ──────────────────────────────────────────

  app.get('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const collections = await storage.listCollections(projectId)
    return c.json(collections)
  })

  app.post('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const data = await c.req.json()
    log.debug({ projectId }, 'creating KB collection')
    const collection = await storage.createCollection(projectId, data)
    return c.json(collection, 201)
  })

  app.patch('/:collectionId', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const collectionId = c.req.param('collectionId') as KBCollectionId
    const data = await c.req.json()
    log.debug({ projectId, collectionId }, 'updating KB collection')
    const collection = await storage.updateCollection(projectId, collectionId, data)
    return c.json(collection)
  })

  app.delete('/:collectionId', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const collectionId = c.req.param('collectionId') as KBCollectionId
    log.debug({ projectId, collectionId }, 'deleting KB collection')
    await storage.deleteCollection(projectId, collectionId)
    return c.json({ ok: true })
  })

  // ── Documents ────────────────────────────────────────────

  app.get('/:collectionId/documents', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const collectionId = c.req.param('collectionId') as KBCollectionId
    const documents = await storage.listDocuments(projectId, collectionId)
    return c.json(documents)
  })

  app.post('/:collectionId/documents', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const collectionId = c.req.param('collectionId') as KBCollectionId
    const data = await c.req.json()
    log.debug({ projectId, collectionId }, 'ingesting KB document')
    const document = await storage.ingestDocument(projectId, collectionId, data)
    return c.json(document, 201)
  })

  app.post('/:collectionId/documents/upload', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const collectionId = c.req.param('collectionId') as KBCollectionId

    const body = await c.req.parseBody()
    const file = body['file']
    if (!(file instanceof File)) {
      return c.json({ error: 'File required' }, 400)
    }

    const title = typeof body['title'] === 'string' ? body['title'] : undefined

    log.debug({ projectId, collectionId, filename: file.name, size: file.size }, 'uploading KB document')

    const buffer = Buffer.from(await file.arrayBuffer())
    const parsed = await parseFile(buffer, file.name)

    const document = await storage.ingestDocument(projectId, collectionId, {
      title: title || file.name,
      content: parsed.text,
      sourceType: 'upload',
      sourceName: file.name,
    })

    return c.json(document, 201)
  })

  app.get('/:collectionId/documents/:docId', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const docId = c.req.param('docId') as KBDocumentId
    const document = await storage.getDocument(projectId, docId)
    return c.json(document)
  })

  app.delete('/:collectionId/documents/:docId', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const docId = c.req.param('docId') as KBDocumentId
    log.debug({ projectId, docId }, 'deleting KB document')
    await storage.deleteDocument(projectId, docId)
    return c.json({ ok: true })
  })

  // ── Flat document routes (by docId only, no collectionId needed) ──

  app.get('/documents/:docId', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const docId = c.req.param('docId') as KBDocumentId
    const document = await storage.getDocument(projectId, docId)
    return c.json(document)
  })

  app.delete('/documents/:docId', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const docId = c.req.param('docId') as KBDocumentId
    log.debug({ projectId, docId }, 'deleting KB document')
    await storage.deleteDocument(projectId, docId)
    return c.json({ ok: true })
  })

  // ── Search & Utilities ───────────────────────────────────

  app.post('/search', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const { query, collectionId, limit } = await c.req.json<{
      query: string; collectionId?: string; limit?: number
    }>()
    if (!query) return c.json({ error: 'Query required' }, 400)

    const results = await storage.search(projectId, query, {
      collectionId: collectionId as KBCollectionId | undefined,
      limit,
    })
    return c.json(results)
  })

  app.get('/hot-content', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const content = await storage.getHotContent(projectId)
    return c.json({ content })
  })

  app.get('/has-vector-data', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const hasData = await storage.hasVectorData(projectId)
    return c.json({ hasVectorData: hasData })
  })

  return app
}
