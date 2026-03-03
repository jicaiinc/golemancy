import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { ProjectId, AgentId, MemoryId } from '@golemancy/shared'
import { DEFAULT_MEMORY_PRIORITY } from '@golemancy/shared'
import type { SqliteMemoryStorage } from '../storage/memories'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:memory-tools' })

export interface MemoryToolsContext {
  projectId: ProjectId
  agentId: AgentId
  memoryStorage: SqliteMemoryStorage
  maxAutoLoad: number
}

export function createMemoryTools(ctx: MemoryToolsContext): ToolSet {
  const { projectId, agentId, memoryStorage, maxAutoLoad } = ctx

  return {
    MemorySave: tool({
      description:
        `Save a new memory to your persistent memory bank. Memories persist across conversations. ` +
        `New memories default to priority ${DEFAULT_MEMORY_PRIORITY} (Normal). ` +
        `Higher priority (up to 5) means the memory is more likely to be auto-loaded in future conversations. ` +
        `Use tags to categorize memories for easier retrieval.`,
      inputSchema: z.object({
        content: z.string().describe('The memory content to save'),
        tags: z.array(z.string()).optional().describe('Tags for categorization (e.g., ["coding", "preferences"])'),
        priority: z.number().min(0).max(5).optional()
          .describe('Priority level 0-5 (0=Archive, 3=Normal default, 5=Critical). Higher priority memories are auto-loaded first.'),
      }),
      execute: async ({ content, tags, priority }) => {
        log.debug({ projectId, agentId, contentLen: content.length }, 'MemorySave tool called')
        const memory = await memoryStorage.create(projectId, agentId, {
          content,
          tags,
          priority,
        })
        const { totalCount } = await memoryStorage.loadForContext(projectId, agentId, maxAutoLoad)
        return {
          saved: { id: memory.id, priority: memory.priority, pinned: memory.pinned },
          status: `Memory saved. Total memories: ${totalCount}. Auto-load limit: ${maxAutoLoad}.`,
        }
      },
    }),

    MemorySearch: tool({
      description:
        `Search your memory bank including memories not currently loaded in context. ` +
        `Use this to find specific memories by keyword, tags, or priority level. ` +
        `Returns up to 50 matching results sorted by priority and recency.`,
      inputSchema: z.object({
        query: z.string().optional().describe('Keyword to search in memory content'),
        tags: z.array(z.string()).optional().describe('Filter by tags (matches any)'),
        pinnedOnly: z.boolean().optional().describe('Only return pinned memories'),
        minPriority: z.number().min(0).max(5).optional().describe('Minimum priority level to include'),
      }),
      execute: async ({ query, tags, pinnedOnly, minPriority }) => {
        log.debug({ projectId, agentId, query, tags }, 'MemorySearch tool called')
        const results = await memoryStorage.search(projectId, agentId, {
          query,
          tags,
          pinnedOnly,
          minPriority,
        })
        return {
          results: results.map(m => ({
            id: m.id,
            content: m.content,
            priority: m.priority,
            pinned: m.pinned,
            tags: m.tags,
            updatedAt: m.updatedAt,
          })),
          count: results.length,
        }
      },
    }),

    MemoryUpdate: tool({
      description:
        `Update an existing memory's content, priority, or tags. ` +
        `Adjust priority (0-5) to control whether a memory stays in your auto-loaded context. ` +
        `Higher priority = more likely to be auto-loaded. ` +
        `Note: You cannot change the pinned status — pinning is controlled by the user.`,
      inputSchema: z.object({
        memoryId: z.string().describe('The ID of the memory to update (e.g., "mem-xxxxxxxxxxxx")'),
        content: z.string().optional().describe('New content for the memory'),
        priority: z.number().min(0).max(5).optional()
          .describe('New priority level 0-5 (0=Archive, 3=Normal, 5=Critical)'),
        tags: z.array(z.string()).optional().describe('New tags (replaces existing tags)'),
      }),
      execute: async ({ memoryId, content, priority, tags }) => {
        log.debug({ projectId, memoryId }, 'MemoryUpdate tool called')
        try {
          const updated = await memoryStorage.update(projectId, agentId, memoryId as MemoryId, {
            content,
            priority,
            tags,
            // Note: pinned is intentionally NOT exposed to agent tools
          })
          return {
            updated: { id: updated.id, content: updated.content, priority: updated.priority, pinned: updated.pinned, tags: updated.tags },
          }
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) }
        }
      },
    }),

    MemoryDelete: tool({
      description: 'Permanently delete a memory from your memory bank.',
      inputSchema: z.object({
        memoryId: z.string().describe('The ID of the memory to delete (e.g., "mem-xxxxxxxxxxxx")'),
      }),
      execute: async ({ memoryId }) => {
        log.debug({ projectId, memoryId }, 'MemoryDelete tool called')
        try {
          await memoryStorage.delete(projectId, agentId, memoryId as MemoryId)
          return { deleted: true, memoryId }
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) }
        }
      },
    }),
  }
}

/**
 * Build the memory instructions block for injection into the agent's system prompt.
 */
export function buildMemoryInstructions(data: {
  pinned: Array<{ id: string; content: string; priority: number; tags: string[] }>
  autoLoaded: Array<{ id: string; content: string; priority: number; tags: string[] }>
  totalCount: number
  maxAutoLoad: number
}): string {
  const { pinned, autoLoaded, totalCount, maxAutoLoad } = data
  const notLoaded = totalCount - pinned.length - autoLoaded.length

  const lines: string[] = []
  lines.push('## Your Memory Bank')
  lines.push('')
  lines.push('### Status')
  lines.push(`- Total memories: ${totalCount}`)
  lines.push(`- Pinned: ${pinned.length} (always loaded, bypass auto-load limit)`)
  lines.push(`- Auto-load limit: ${maxAutoLoad}`)
  lines.push(`- Auto-loaded: ${autoLoaded.length}/${maxAutoLoad} (sorted by priority DESC, then recency)`)
  lines.push(`- Not in context: ${notLoaded} (all memories are always available via MemorySearch)`)

  if (pinned.length > 0) {
    lines.push('')
    lines.push('### Pinned Memories (always loaded)')
    for (const m of pinned) {
      const tagStr = m.tags.length > 0 ? ` ${m.tags.map(t => `#${t}`).join(' ')}` : ''
      lines.push(`[${m.id}] (pinned, priority:${m.priority})${tagStr}: ${m.content}`)
    }
  }

  if (autoLoaded.length > 0) {
    lines.push('')
    lines.push(`### Auto-loaded Memories (top ${autoLoaded.length} by priority + recency)`)
    for (const m of autoLoaded) {
      const tagStr = m.tags.length > 0 ? ` ${m.tags.map(t => `#${t}`).join(' ')}` : ''
      lines.push(`[${m.id}] (priority:${m.priority})${tagStr}: ${m.content}`)
    }
  }

  lines.push('')
  lines.push('### Memory Guidelines')
  lines.push('')
  lines.push('**When to save a memory:**')
  lines.push('- User preferences or corrections that should persist across conversations')
  lines.push('- Key decisions, conclusions, or context worth remembering long-term')
  lines.push('- Patterns you\'ve noticed in the user\'s behavior or requirements')
  lines.push('- Solutions to problems that may recur')
  lines.push('- When the user explicitly asks you to remember something')
  lines.push('')
  lines.push('**When NOT to save:**')
  lines.push('- Temporary context specific to the current conversation')
  lines.push('- Information already present in your system prompt or configuration')
  lines.push('- Raw data, full code blocks, or lengthy outputs (summarize instead)')
  lines.push('- Speculative or unverified conclusions')
  lines.push('- Duplicates of existing memories (update the existing one instead)')
  lines.push('')
  lines.push('**When the user asks you to "remember" or "forget":**')
  lines.push('- "Remember" → Use MemorySave immediately, no need to verify importance')
  lines.push('- "Forget" → Find the relevant memory with MemorySearch, then MemoryDelete')
  lines.push('')
  lines.push('### Memory Tools')
  lines.push('You have 4 tools: MemorySave, MemorySearch, MemoryUpdate, MemoryDelete.')
  lines.push('Priority scale: 0 (Archive) → 3 (Normal, default) → 5 (Critical).')
  lines.push('Higher priority memories are auto-loaded into your context window at the start of each conversation.')
  lines.push('All memories are always available via MemorySearch regardless of priority — priority only affects which ones appear in context automatically.')
  lines.push('Use tags to categorize memories for easier retrieval.')
  lines.push('When a memory becomes outdated, update it rather than creating a new one.')
  lines.push('Pinned memories are controlled by the user — do not ask to unpin them.')

  return lines.join('\n')
}
