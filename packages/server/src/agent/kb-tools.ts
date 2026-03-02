import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { ProjectId, KBCollectionId } from '@golemancy/shared'
import type { KnowledgeBaseStorage } from '../storage/knowledge-base'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:kb-tools' })

export interface KBToolsContext {
  projectId: ProjectId
  kbStorage: KnowledgeBaseStorage
}

export function createKBTools(ctx: KBToolsContext): ToolSet {
  const { projectId, kbStorage } = ctx

  return {
    kb_search: tool({
      description: 'Search the project knowledge base for relevant documents and information. Returns matching text chunks with relevance scores.',
      inputSchema: z.object({
        query: z.string().describe('The search query'),
        collection: z.string().optional().describe('Optional: search only within a specific collection name'),
        limit: z.number().optional().default(5).describe('Maximum number of results to return'),
      }),
      execute: async ({ query, collection, limit }) => {
        log.debug({ projectId, query, collection }, 'kb_search tool called')

        let collectionId: KBCollectionId | undefined
        if (collection) {
          // Resolve collection name to ID
          const collections = await kbStorage.listCollections(projectId)
          const found = collections.find(c => c.name.toLowerCase() === collection.toLowerCase())
          if (found) collectionId = found.id
        }

        const results = await kbStorage.search(projectId, query, { collectionId, limit })
        if (results.length === 0) {
          return { results: [], message: 'No matching documents found.' }
        }
        return {
          results: results.map(r => ({
            collection: r.collectionName,
            content: r.chunkContent,
            score: Math.round(r.score * 1000) / 1000,
            source: r.sourceName,
            sourceType: r.sourceType,
          })),
        }
      },
    }),

    kb_store: tool({
      description: 'Store new knowledge in the project knowledge base. Creates a document in the specified or default collection.',
      inputSchema: z.object({
        content: z.string().describe('The text content to store'),
        title: z.string().optional().describe('Optional title for the document'),
        collection: z.string().optional().describe('Collection name to store in. If not found, stores in a default "Hot" collection.'),
      }),
      execute: async ({ content, title, collection }) => {
        log.debug({ projectId, collection, contentLength: content.length }, 'kb_store tool called')

        const collections = await kbStorage.listCollections(projectId)
        let targetCollectionId: KBCollectionId

        if (collection) {
          const found = collections.find(c => c.name.toLowerCase() === collection.toLowerCase())
          if (found) {
            targetCollectionId = found.id
          } else {
            // Create a new hot collection with the given name
            const newCol = await kbStorage.createCollection(projectId, {
              name: collection,
              tier: 'hot',
            })
            targetCollectionId = newCol.id
          }
        } else {
          // Use first hot collection, or create "Default" hot collection
          const hotCol = collections.find(c => c.tier === 'hot')
          if (hotCol) {
            targetCollectionId = hotCol.id
          } else {
            const newCol = await kbStorage.createCollection(projectId, {
              name: 'Default',
              tier: 'hot',
            })
            targetCollectionId = newCol.id
          }
        }

        const doc = await kbStorage.ingestDocument(projectId, targetCollectionId, {
          title,
          content,
          sourceType: 'agent',
          sourceName: 'agent',
        })

        return {
          stored: true,
          documentId: doc.id,
          charCount: doc.charCount,
        }
      },
    }),
  }
}
