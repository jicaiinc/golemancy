import { logger } from '../logger'

const log = logger.child({ component: 'agent:active-chat-registry' })

interface ActiveEntry {
  conversationId: string
  agentId: string
  projectId: string
  startedAt: string
}

/**
 * In-memory registry of active chat sessions.
 * Used for reference counting per-agent to determine running/idle status.
 */
export class ActiveChatRegistry {
  private entries = new Map<string, ActiveEntry>()

  register(conversationId: string, info: { agentId: string; projectId: string }) {
    this.entries.set(conversationId, {
      conversationId,
      agentId: info.agentId,
      projectId: info.projectId,
      startedAt: new Date().toISOString(),
    })
    log.debug({ conversationId, agentId: info.agentId, total: this.entries.size }, 'registered active chat')
  }

  unregister(conversationId: string) {
    this.entries.delete(conversationId)
    log.debug({ conversationId, total: this.entries.size }, 'unregistered active chat')
  }

  /** Count active chats for a specific agent (across all projects). */
  countByAgent(agentId: string): number {
    let count = 0
    for (const entry of this.entries.values()) {
      if (entry.agentId === agentId) count++
    }
    return count
  }

  /** Get all running chats for a specific project. */
  getRunningForProject(projectId: string): ActiveEntry[] {
    const result: ActiveEntry[] = []
    for (const entry of this.entries.values()) {
      if (entry.projectId === projectId) result.push(entry)
    }
    return result
  }

  /** Get all active entries. */
  getAll(): ActiveEntry[] {
    return Array.from(this.entries.values())
  }

  get size() {
    return this.entries.size
  }
}
