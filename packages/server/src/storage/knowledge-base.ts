import { eq, sql, desc } from 'drizzle-orm'
import type {
  ProjectId, KBCollectionId, KBDocumentId,
  KBCollection, KBDocument, KBSearchResult,
  KBCollectionTier, KBSourceType,
  GlobalSettings, ProjectConfig,
} from '@golemancy/shared'
import type { AppDatabase } from '../db/client'
import { kbCollections, kbDocuments, kbChunks } from '../db/schema'
import { generateId } from '../utils/ids'
import { chunkText } from '../agent/chunker'
import { embedText, embedTexts, getEmbeddingDimensions, resolveEmbeddingConfig, type ResolvedEmbeddingConfig } from '../agent/embedding'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:knowledge-base' })

export class KnowledgeBaseStorage {
  constructor(
    private getProjectDb: (projectId: ProjectId) => AppDatabase,
    private getSettings: () => Promise<GlobalSettings>,
    private getProjectConfig?: (projectId: ProjectId) => Promise<ProjectConfig | undefined>,
  ) {}

  // ── Collections ──────────────────────────────────────────

  async listCollections(projectId: ProjectId): Promise<KBCollection[]> {
    const db = this.getProjectDb(projectId)
    const rows = db.select().from(kbCollections).orderBy(desc(kbCollections.updatedAt)).all()

    // Aggregate document count and total chars per collection
    const stats = db.all<{ collectionId: string; docCount: number; totalChars: number }>(sql`
      SELECT collection_id AS collectionId, COUNT(*) AS docCount, COALESCE(SUM(char_count), 0) AS totalChars
      FROM kb_documents GROUP BY collection_id
    `)
    const statsMap = new Map(stats.map(s => [s.collectionId, s]))

    return rows.map(r => {
      const s = statsMap.get(r.id)
      return {
        id: r.id as KBCollectionId,
        name: r.name,
        description: r.description,
        tier: r.tier as KBCollectionTier,
        documentCount: s?.docCount ?? 0,
        totalChars: s?.totalChars ?? 0,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }
    })
  }

  async createCollection(
    projectId: ProjectId,
    data: { name: string; description?: string; tier: KBCollectionTier },
  ): Promise<KBCollection> {
    const db = this.getProjectDb(projectId)
    const id = generateId('kbc')
    const now = new Date().toISOString()

    db.insert(kbCollections).values({
      id,
      name: data.name,
      description: data.description ?? '',
      tier: data.tier,
      createdAt: now,
      updatedAt: now,
    }).run()

    log.debug({ projectId, collectionId: id, tier: data.tier }, 'created KB collection')
    return {
      id,
      name: data.name,
      description: data.description ?? '',
      tier: data.tier,
      documentCount: 0,
      totalChars: 0,
      createdAt: now,
      updatedAt: now,
    }
  }

  async updateCollection(
    projectId: ProjectId,
    id: KBCollectionId,
    data: Partial<{ name: string; description: string; tier: KBCollectionTier }>,
  ): Promise<KBCollection> {
    const db = this.getProjectDb(projectId)
    const existing = db.select().from(kbCollections).where(eq(kbCollections.id, id)).get()
    if (!existing) throw new Error(`Collection ${id} not found`)

    const oldTier = existing.tier as KBCollectionTier
    const newTier = data.tier

    db.update(kbCollections).set({
      ...data,
      updatedAt: new Date().toISOString(),
    }).where(eq(kbCollections.id, id)).run()

    // Handle tier change: rebuild indexes
    if (newTier && newTier !== oldTier) {
      await this.handleTierChange(projectId, id, oldTier, newTier)
    }

    return (await this.listCollections(projectId)).find(c => c.id === id)!
  }

  async deleteCollection(projectId: ProjectId, id: KBCollectionId): Promise<void> {
    const db = this.getProjectDb(projectId)

    db.$client.transaction(() => {
      // Delete vectors from vec table (virtual table, no CASCADE)
      const chunks = db.select({ id: kbChunks.id }).from(kbChunks)
        .innerJoin(kbDocuments, eq(kbChunks.documentId, kbDocuments.id))
        .where(eq(kbDocuments.collectionId, id))
        .all()
      if (chunks.length > 0) {
        this.deleteVectors(db, chunks.map(c => c.id))
      }

      // Delete FTS entries for docs in this collection
      const docs = db.select({ id: kbDocuments.id }).from(kbDocuments).where(eq(kbDocuments.collectionId, id)).all()
      for (const doc of docs) {
        db.run(sql`DELETE FROM kb_documents_fts WHERE document_id = ${doc.id}`)
      }

      // Delete collection (cascades to documents and chunks)
      db.delete(kbCollections).where(eq(kbCollections.id, id)).run()
    })()

    log.debug({ projectId, collectionId: id }, 'deleted KB collection')
  }

  // ── Documents ────────────────────────────────────────────

  async listDocuments(projectId: ProjectId, collectionId: KBCollectionId): Promise<KBDocument[]> {
    const db = this.getProjectDb(projectId)
    const rows = db.select().from(kbDocuments)
      .where(eq(kbDocuments.collectionId, collectionId))
      .orderBy(desc(kbDocuments.updatedAt))
      .all()

    return rows.map(r => this.mapDocument(r))
  }

  async ingestDocument(
    projectId: ProjectId,
    collectionId: KBCollectionId,
    data: { title?: string; content: string; sourceType: KBSourceType; sourceName?: string },
  ): Promise<KBDocument> {
    const db = this.getProjectDb(projectId)

    // Get collection to determine tier
    const collection = db.select().from(kbCollections).where(eq(kbCollections.id, collectionId)).get()
    if (!collection) throw new Error(`Collection ${collectionId} not found`)

    const tier = collection.tier as KBCollectionTier
    const id = generateId('kbd')
    const now = new Date().toISOString()
    const title = data.title || 'Untitled'
    const charCount = data.content.length

    // ── Phase 1: Chunking + embedding (outside transaction — may call external API) ──
    let chunks: ReturnType<typeof chunkText> = []
    let embeddings: number[][] = []
    const needsChunks = tier === 'warm' || tier === 'cold'

    if (needsChunks) {
      // Require embedding config for warm/cold tier
      const config = await this.getEmbeddingConfig(projectId)
      if (!config) {
        throw new Error('Embedding not configured. Configure an embedding API key in Settings before adding documents to Warm/Cold tier collections.')
      }

      chunks = chunkText(data.content)

      // Embed chunks (external API call — must happen before transaction)
      await this.ensureVecTable(projectId, db)
      const texts = chunks.map(c => c.content)
      embeddings = await embedTexts(texts, config)
    }

    // ── Phase 2: Atomic DB writes (transaction) ──
    const chunkIds: string[] = []
    db.$client.transaction(() => {
      if (needsChunks) {
        // Insert document
        db.insert(kbDocuments).values({
          id, collectionId, title, content: data.content,
          sourceType: data.sourceType, sourceName: data.sourceName ?? '',
          charCount, chunkCount: chunks.length, createdAt: now, updatedAt: now,
        }).run()

        // Insert chunks
        for (const chunk of chunks) {
          const chunkId = generateId('kbchk')
          chunkIds.push(chunkId)
          db.insert(kbChunks).values({
            id: chunkId, documentId: id, chunkIndex: chunk.index,
            content: chunk.content, charCount: chunk.charCount, createdAt: now,
          }).run()
        }

        // Store vectors
        if (embeddings.length > 0) {
          const stmt = db.$client.prepare('INSERT INTO vec_kb_chunks(chunk_id, embedding) VALUES (?, ?)')
          for (let i = 0; i < chunkIds.length; i++) {
            stmt.run(chunkIds[i], new Float32Array(embeddings[i]))
          }
        }

        // FTS for warm tier only
        if (tier === 'warm') {
          db.run(sql`INSERT INTO kb_documents_fts(document_id, title, content) VALUES (${id}, ${title}, ${data.content})`)
        }
      } else {
        // Hot or archive: store document only (no chunks, no vectors)
        db.insert(kbDocuments).values({
          id, collectionId, title, content: data.content,
          sourceType: data.sourceType, sourceName: data.sourceName ?? '',
          charCount, chunkCount: 0, createdAt: now, updatedAt: now,
        }).run()

        // FTS for hot tier
        if (tier === 'hot') {
          db.run(sql`INSERT INTO kb_documents_fts(document_id, title, content) VALUES (${id}, ${title}, ${data.content})`)
        }
      }

      // Update collection timestamp
      db.update(kbCollections).set({ updatedAt: now }).where(eq(kbCollections.id, collectionId)).run()
    })()

    log.debug({ projectId, collectionId, documentId: id, tier, chunkCount: chunks.length }, 'ingested KB document')
    return this.getDocument(projectId, id)
  }

  async getDocument(projectId: ProjectId, documentId: KBDocumentId): Promise<KBDocument> {
    const db = this.getProjectDb(projectId)
    const row = db.select().from(kbDocuments).where(eq(kbDocuments.id, documentId)).get()
    if (!row) throw new Error(`Document ${documentId} not found`)
    return this.mapDocument(row)
  }

  async deleteDocument(projectId: ProjectId, documentId: KBDocumentId): Promise<void> {
    const db = this.getProjectDb(projectId)

    db.$client.transaction(() => {
      // Delete vectors (virtual table, no CASCADE)
      const chunks = db.select({ id: kbChunks.id }).from(kbChunks).where(eq(kbChunks.documentId, documentId)).all()
      if (chunks.length > 0) {
        this.deleteVectors(db, chunks.map(c => c.id))
      }

      // Delete FTS entry
      db.run(sql`DELETE FROM kb_documents_fts WHERE document_id = ${documentId}`)

      // Delete document (cascades to chunks)
      db.delete(kbDocuments).where(eq(kbDocuments.id, documentId)).run()
    })()

    log.debug({ projectId, documentId }, 'deleted KB document')
  }

  // ── Search ───────────────────────────────────────────────

  /** Sanitize user query for FTS5 MATCH — wrap in quotes, escape internal quotes */
  private sanitizeFtsQuery(query: string): string {
    return '"' + query.replace(/"/g, '""') + '"'
  }

  async search(
    projectId: ProjectId,
    query: string,
    options?: { collectionId?: KBCollectionId; limit?: number },
  ): Promise<KBSearchResult[]> {
    const db = this.getProjectDb(projectId)
    const limit = options?.limit ?? 10
    const results: KBSearchResult[] = []
    const sanitized = this.sanitizeFtsQuery(query)

    // 1. FTS search (Hot + Warm documents with FTS entries)
    try {
      const ftsResults = options?.collectionId
        ? db.all<{
            document_id: string; rank: number;
            content: string; collection_name: string;
            source_type: string; source_name: string
          }>(sql`
            SELECT f.document_id,
              snippet(kb_documents_fts, 2, '', '', '...', 32) AS content,
              f.rank, c.name AS collection_name,
              d.source_type, d.source_name
            FROM kb_documents_fts f
            JOIN kb_documents d ON d.id = f.document_id
            JOIN kb_collections c ON c.id = d.collection_id
            WHERE kb_documents_fts MATCH ${sanitized}
              AND d.collection_id = ${options.collectionId}
            ORDER BY f.rank
            LIMIT ${limit}
          `)
        : db.all<{
            document_id: string; rank: number;
            content: string; collection_name: string;
            source_type: string; source_name: string
          }>(sql`
            SELECT f.document_id,
              snippet(kb_documents_fts, 2, '', '', '...', 32) AS content,
              f.rank, c.name AS collection_name,
              d.source_type, d.source_name
            FROM kb_documents_fts f
            JOIN kb_documents d ON d.id = f.document_id
            JOIN kb_collections c ON c.id = d.collection_id
            WHERE kb_documents_fts MATCH ${sanitized}
            ORDER BY f.rank
            LIMIT ${limit}
          `)

      for (const r of ftsResults) {
        results.push({
          documentId: r.document_id as KBDocumentId,
          collectionName: r.collection_name,
          chunkContent: r.content,
          chunkIndex: 0,
          score: -r.rank, // FTS rank is negative; higher absolute = better match
          sourceType: r.source_type as KBSourceType,
          sourceName: r.source_name,
        })
      }
    } catch (err) {
      log.warn({ err, projectId }, 'FTS search failed')
    }

    // 2. Vector search (Warm + Cold documents with embeddings)
    const embeddingConfig = await this.getEmbeddingConfig(projectId)
    if (embeddingConfig && this.hasVecTable(db)) {
      try {
        const queryVec = await embedText(query, embeddingConfig)

        const vecSql = options?.collectionId
          ? `SELECT v.chunk_id, v.distance, ck.content, ck.chunk_index,
              d.id AS document_id, c.name AS collection_name,
              d.source_type, d.source_name
            FROM vec_kb_chunks v
            JOIN kb_chunks ck ON ck.id = v.chunk_id
            JOIN kb_documents d ON d.id = ck.document_id
            JOIN kb_collections c ON c.id = d.collection_id
            WHERE v.embedding MATCH ? AND k = ?
              AND d.collection_id = ?`
          : `SELECT v.chunk_id, v.distance, ck.content, ck.chunk_index,
              d.id AS document_id, c.name AS collection_name,
              d.source_type, d.source_name
            FROM vec_kb_chunks v
            JOIN kb_chunks ck ON ck.id = v.chunk_id
            JOIN kb_documents d ON d.id = ck.document_id
            JOIN kb_collections c ON c.id = d.collection_id
            WHERE v.embedding MATCH ? AND k = ?`

        const params = options?.collectionId
          ? [new Float32Array(queryVec), limit, options.collectionId]
          : [new Float32Array(queryVec), limit]

        const vecResults = db.$client.prepare(vecSql).all(...params) as Array<{
          chunk_id: string; distance: number; content: string; chunk_index: number;
          document_id: string; collection_name: string; source_type: string; source_name: string
        }>

        for (const r of vecResults) {
          // Avoid duplicates (already in FTS results)
          if (!results.some(e => e.documentId === r.document_id && e.chunkIndex === r.chunk_index)) {
            results.push({
              documentId: r.document_id as KBDocumentId,
              collectionName: r.collection_name,
              chunkContent: r.content,
              chunkIndex: r.chunk_index,
              score: 1 - r.distance, // cosine distance to similarity
              sourceType: r.source_type as KBSourceType,
              sourceName: r.source_name,
            })
          }
        }
      } catch (err) {
        log.warn({ err, projectId }, 'vector search failed, returning FTS results only')
      }
    }

    // Sort by score descending and take top limit
    results.sort((a, b) => b.score - a.score)
    return results.slice(0, limit)
  }

  // ── Hot Content Injection ────────────────────────────────

  async getHotContent(projectId: ProjectId): Promise<string> {
    const db = this.getProjectDb(projectId)

    const rows = db.all<{ collectionName: string; title: string; content: string }>(sql`
      SELECT c.name AS collectionName, d.title, d.content
      FROM kb_documents d
      JOIN kb_collections c ON c.id = d.collection_id
      WHERE c.tier = 'hot'
      ORDER BY c.name, d.created_at
    `)

    if (rows.length === 0) return ''

    // Group by collection
    const byCollection = new Map<string, Array<{ title: string; content: string }>>()
    for (const r of rows) {
      const docs = byCollection.get(r.collectionName) ?? []
      docs.push({ title: r.title, content: r.content })
      byCollection.set(r.collectionName, docs)
    }

    // Format as XML
    const parts: string[] = []
    for (const [name, docs] of byCollection) {
      const docParts = docs.map(d => `<document title="${d.title}">\n${d.content}\n</document>`).join('\n')
      parts.push(`<collection name="${name}">\n${docParts}\n</collection>`)
    }

    return `<knowledge>\n${parts.join('\n')}\n</knowledge>`
  }

  // ── Embedding Lock Check ─────────────────────────────────

  async hasVectorData(projectId: ProjectId): Promise<boolean> {
    const db = this.getProjectDb(projectId)
    if (!this.hasVecTable(db)) return false
    const row = db.$client.prepare('SELECT COUNT(*) AS cnt FROM vec_kb_chunks').get() as { cnt: number } | undefined
    return (row?.cnt ?? 0) > 0
  }

  // ── Internal Helpers ─────────────────────────────────────

  private mapDocument(row: typeof kbDocuments.$inferSelect): KBDocument {
    return {
      id: row.id as KBDocumentId,
      collectionId: row.collectionId as KBCollectionId,
      title: row.title,
      content: row.content,
      sourceType: row.sourceType as KBSourceType,
      sourceName: row.sourceName,
      metadata: row.metadata as Record<string, unknown> | undefined,
      tags: row.tags as string[] | undefined,
      charCount: row.charCount,
      chunkCount: row.chunkCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  private async getEmbeddingConfig(projectId: ProjectId): Promise<ResolvedEmbeddingConfig | null> {
    const settings = await this.getSettings()
    const projectConfig = this.getProjectConfig ? await this.getProjectConfig(projectId) : undefined
    return resolveEmbeddingConfig(settings, projectConfig)
  }

  /**
   * Ensure vec_kb_chunks virtual table exists.
   * Dimensions are based on the current embedding model.
   */
  private async ensureVecTable(projectId: ProjectId, db: AppDatabase): Promise<void> {
    if (this.hasVecTable(db)) return

    const config = await this.getEmbeddingConfig(projectId)
    if (!config) throw new Error('Embedding not configured')

    const dims = getEmbeddingDimensions(config.model)
    // Use sql.raw for DDL with dynamic dimension — dims is a trusted number from our own lookup
    db.run(sql.raw(
      `CREATE VIRTUAL TABLE IF NOT EXISTS vec_kb_chunks USING vec0(chunk_id TEXT PRIMARY KEY, embedding float[${dims}] distance_metric=cosine)`,
    ))
    log.info({ projectId, dims, model: config.model }, 'created vec_kb_chunks virtual table')
  }

  private hasVecTable(db: AppDatabase): boolean {
    const row = db.$client.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='vec_kb_chunks'",
    ).get() as { name: string } | undefined
    return !!row
  }

  private async embedAndStoreChunks(projectId: ProjectId, db: AppDatabase, documentId: string): Promise<void> {
    const config = await this.getEmbeddingConfig(projectId)
    if (!config) return // Embedding not enabled — skip vector indexing

    const chunks = db.select().from(kbChunks)
      .where(eq(kbChunks.documentId, documentId))
      .orderBy(kbChunks.chunkIndex)
      .all()

    if (chunks.length === 0) return

    await this.ensureVecTable(projectId, db)

    const texts = chunks.map(c => c.content)
    const embeddings = await embedTexts(texts, config)

    const stmt = db.$client.prepare('INSERT INTO vec_kb_chunks(chunk_id, embedding) VALUES (?, ?)')
    const insertBatch = db.$client.transaction((items: Array<{ id: string; embedding: number[] }>) => {
      for (const item of items) {
        stmt.run(item.id, new Float32Array(item.embedding))
      }
    })
    insertBatch(chunks.map((c, i) => ({ id: c.id, embedding: embeddings[i] })))

    log.debug({ projectId, documentId, chunkCount: chunks.length }, 'embedded and stored vectors')
  }

  private deleteVectors(db: AppDatabase, chunkIds: string[]): void {
    if (!this.hasVecTable(db)) return
    const stmt = db.$client.prepare('DELETE FROM vec_kb_chunks WHERE chunk_id = ?')
    const deleteBatch = db.$client.transaction((ids: string[]) => {
      for (const id of ids) stmt.run(id)
    })
    deleteBatch(chunkIds)
  }

  private async handleTierChange(
    projectId: ProjectId,
    collectionId: KBCollectionId,
    oldTier: KBCollectionTier,
    newTier: KBCollectionTier,
  ): Promise<void> {
    const db = this.getProjectDb(projectId)
    const docs = db.select().from(kbDocuments).where(eq(kbDocuments.collectionId, collectionId)).all()

    for (const doc of docs) {
      const docId = doc.id

      // Clean up old indexes
      if (oldTier === 'warm' || oldTier === 'cold') {
        // Delete vectors
        const chunks = db.select({ id: kbChunks.id }).from(kbChunks).where(eq(kbChunks.documentId, docId)).all()
        if (chunks.length > 0) this.deleteVectors(db, chunks.map(c => c.id))
        // Delete chunks
        db.delete(kbChunks).where(eq(kbChunks.documentId, docId)).run()
      }
      if (oldTier === 'hot' || oldTier === 'warm') {
        db.run(sql`DELETE FROM kb_documents_fts WHERE document_id = ${docId}`)
      }

      // Build new indexes
      if (newTier === 'warm' || newTier === 'cold') {
        const chunks = chunkText(doc.content)
        const now = new Date().toISOString()
        for (const chunk of chunks) {
          db.insert(kbChunks).values({
            id: generateId('kbchk'), documentId: docId, chunkIndex: chunk.index,
            content: chunk.content, charCount: chunk.charCount, createdAt: now,
          }).run()
        }
        db.update(kbDocuments).set({ chunkCount: chunks.length }).where(eq(kbDocuments.id, docId)).run()

        await this.embedAndStoreChunks(projectId, db, docId)

        if (newTier === 'warm') {
          db.run(sql`INSERT INTO kb_documents_fts(document_id, title, content) VALUES (${docId}, ${doc.title}, ${doc.content})`)
        }
      } else if (newTier === 'hot') {
        db.update(kbDocuments).set({ chunkCount: 0 }).where(eq(kbDocuments.id, docId)).run()
        db.run(sql`INSERT INTO kb_documents_fts(document_id, title, content) VALUES (${docId}, ${doc.title}, ${doc.content})`)
      } else {
        // Archive: no indexes
        db.update(kbDocuments).set({ chunkCount: 0 }).where(eq(kbDocuments.id, docId)).run()
      }
    }

    log.info({ projectId, collectionId, oldTier, newTier, docCount: docs.length }, 'tier change: rebuilt indexes')
  }
}
