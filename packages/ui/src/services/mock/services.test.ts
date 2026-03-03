import { describe, it, expect, beforeEach } from 'vitest'
import type { ProjectId, AgentId, ConversationId } from '@golemancy/shared'
import {
  MockProjectService,
  MockAgentService,
  MockConversationService,
  MockTaskService,
  MockWorkspaceService,
  MockSettingsService,
  MockDashboardService,
} from './services'
import { SEED_PROJECTS, SEED_AGENTS, SEED_CONVERSATION_TASKS } from './data'

describe('MockProjectService', () => {
  let service: MockProjectService

  beforeEach(() => {
    service = new MockProjectService()
  })

  it('list() returns seed projects', async () => {
    const projects = await service.list()
    expect(projects.length).toBeGreaterThanOrEqual(2)
  })

  it('getById() returns existing project', async () => {
    const project = await service.getById('proj-1' as ProjectId)
    expect(project).not.toBeNull()
    expect(project!.name).toBe('Content Biz')
  })

  it('getById() returns null for non-existent project', async () => {
    const project = await service.getById('proj-999' as ProjectId)
    expect(project).toBeNull()
  })

  it('create() adds a new project', async () => {
    const created = await service.create({
      name: 'New Project',
      description: 'A new project',
      icon: 'hammer',
    })
    expect(created.id).toBeTruthy()
    expect(created.name).toBe('New Project')
    expect(created.agentCount).toBe(0)

    const found = await service.getById(created.id)
    expect(found).not.toBeNull()
  })

  it('update() modifies an existing project', async () => {
    const updated = await service.update('proj-1' as ProjectId, { name: 'Updated Name' })
    expect(updated.name).toBe('Updated Name')
    expect(updated.updatedAt).toBeTruthy()
  })

  it('update() throws for non-existent project', async () => {
    await expect(
      service.update('proj-999' as ProjectId, { name: 'Nope' }),
    ).rejects.toThrow('not found')
  })

  it('delete() removes a project', async () => {
    await service.delete('proj-1' as ProjectId)
    const project = await service.getById('proj-1' as ProjectId)
    expect(project).toBeNull()
  })
})

describe('MockAgentService', () => {
  let service: MockAgentService

  beforeEach(() => {
    service = new MockAgentService()
  })

  it('list() filters by projectId', async () => {
    const proj1Agents = await service.list('proj-1' as ProjectId)
    const proj2Agents = await service.list('proj-2' as ProjectId)
    expect(proj1Agents.length).toBeGreaterThan(0)
    expect(proj2Agents.length).toBeGreaterThan(0)
    // Ensure isolation
    proj1Agents.forEach(a => expect(a.projectId).toBe('proj-1'))
    proj2Agents.forEach(a => expect(a.projectId).toBe('proj-2'))
  })

  it('list() returns empty for unknown project', async () => {
    const agents = await service.list('proj-999' as ProjectId)
    expect(agents).toEqual([])
  })

  it('create() creates agent under specific project', async () => {
    const agent = await service.create('proj-1' as ProjectId, {
      name: 'New Agent',
      description: 'desc',
      systemPrompt: 'prompt',
      modelConfig: { provider: 'openai', model: 'gpt-4o' },
    })
    expect(agent.projectId).toBe('proj-1')
    expect(agent.name).toBe('New Agent')
    expect(agent.status).toBe('idle')
  })

  it('update() throws for agent in wrong project', async () => {
    await expect(
      service.update('proj-2' as ProjectId, 'agent-1' as AgentId, { name: 'Nope' }),
    ).rejects.toThrow('not found')
  })

  it('delete() only deletes agent in matching project', async () => {
    // agent-1 belongs to proj-1, deleting under proj-2 should not remove it
    await service.delete('proj-2' as ProjectId, 'agent-1' as AgentId)
    const agent = await service.getById('proj-1' as ProjectId, 'agent-1' as AgentId)
    expect(agent).not.toBeNull()

    // Now delete under correct project
    await service.delete('proj-1' as ProjectId, 'agent-1' as AgentId)
    const deleted = await service.getById('proj-1' as ProjectId, 'agent-1' as AgentId)
    expect(deleted).toBeNull()
  })

  it('getById() returns null for mismatched projectId', async () => {
    const agent = await service.getById('proj-2' as ProjectId, 'agent-1' as AgentId)
    expect(agent).toBeNull()
  })
})

describe('MockConversationService', () => {
  let service: MockConversationService

  beforeEach(() => {
    service = new MockConversationService()
  })

  it('list() filters by projectId', async () => {
    const convos = await service.list('proj-1' as ProjectId)
    expect(convos.length).toBeGreaterThan(0)
    convos.forEach(c => expect(c.projectId).toBe('proj-1'))
  })

  it('list() filters by agentId when provided', async () => {
    const convos = await service.list('proj-1' as ProjectId, 'agent-1' as AgentId)
    convos.forEach(c => expect(c.agentId).toBe('agent-1'))
  })

  it('create() creates a new conversation', async () => {
    const conv = await service.create('proj-1' as ProjectId, 'agent-1' as AgentId, 'New Chat')
    expect(conv.title).toBe('New Chat')
    expect(conv.projectId).toBe('proj-1')
    expect(conv.agentId).toBe('agent-1')
    expect(conv.messages).toEqual([])
  })

  it('sendMessage() adds user and assistant messages', async () => {
    const conv = await service.create('proj-1' as ProjectId, 'agent-1' as AgentId, 'Chat')
    await service.sendMessage('proj-1' as ProjectId, conv.id, 'Hello')

    const fetched = await service.getById('proj-1' as ProjectId, conv.id)
    expect(fetched!.messages).toHaveLength(2)
    expect(fetched!.messages[0].role).toBe('user')
    expect(fetched!.messages[0].content).toBe('Hello')
    expect(fetched!.messages[1].role).toBe('assistant')
    expect(fetched!.messages[1].content).toContain('Hello')
  })

  it('sendMessage() throws for wrong projectId', async () => {
    await expect(
      service.sendMessage('proj-2' as ProjectId, 'conv-1' as ConversationId, 'Bad'),
    ).rejects.toThrow('not found')
  })

  it('delete() removes conversation only from matching project', async () => {
    await service.delete('proj-2' as ProjectId, 'conv-1' as ConversationId)
    // conv-1 belongs to proj-1, so should still exist
    const conv = await service.getById('proj-1' as ProjectId, 'conv-1' as ConversationId)
    expect(conv).not.toBeNull()

    await service.delete('proj-1' as ProjectId, 'conv-1' as ConversationId)
    const deleted = await service.getById('proj-1' as ProjectId, 'conv-1' as ConversationId)
    expect(deleted).toBeNull()
  })
})

describe('MockTaskService', () => {
  let service: MockTaskService

  beforeEach(() => {
    service = new MockTaskService()
  })

  it('list() returns all tasks', async () => {
    const tasks = await service.list('proj-1' as ProjectId)
    expect(tasks.length).toBeGreaterThan(0)
  })

  it('list() filters by conversationId', async () => {
    const tasks = await service.list('proj-1' as ProjectId, 'conv-1' as ConversationId)
    expect(tasks.length).toBeGreaterThan(0)
    tasks.forEach(t => expect(t.conversationId).toBe('conv-1'))
  })

  it('getById() returns task', async () => {
    const task = await service.getById('proj-1' as ProjectId, 'task-1' as any)
    expect(task).not.toBeNull()
    expect(task!.subject).toBe('Draft blog post')
  })
})

describe('MockWorkspaceService', () => {
  let service: MockWorkspaceService

  beforeEach(() => {
    service = new MockWorkspaceService()
  })

  it('listDir() returns workspace entries', async () => {
    const entries = await service.listDir('proj-1' as ProjectId, '')
    expect(entries.length).toBeGreaterThan(0)
  })

  it('readFile() returns file preview data', async () => {
    const preview = await service.readFile('proj-1' as ProjectId, 'report.md')
    expect(preview).not.toBeNull()
    expect(preview.category).toBe('text')
  })

  it('deleteFile() removes file', async () => {
    await service.deleteFile('proj-1' as ProjectId, 'report.md')
    const entries = await service.listDir('proj-1' as ProjectId, '/')
    const found = entries.find(e => e.name === 'report.md')
    expect(found).toBeUndefined()
  })

  it('getFileUrl() returns URL string', () => {
    const url = service.getFileUrl('proj-1' as ProjectId, 'report.md')
    expect(url).toContain('report.md')
  })
})

describe('MockSettingsService', () => {
  let service: MockSettingsService

  beforeEach(() => {
    service = new MockSettingsService()
  })

  it('get() returns settings', async () => {
    const settings = await service.get()
    expect(settings.providers).toBeDefined()
    expect(settings.theme).toBe('dark')
  })

  it('update() merges settings', async () => {
    const updated = await service.update({ theme: 'light' })
    expect(updated.theme).toBe('light')
    expect(updated.providers).toBeDefined() // unchanged

    // Verify persistence
    const fetched = await service.get()
    expect(fetched.theme).toBe('light')
  })
})

describe('MockDashboardService', () => {
  let service: MockDashboardService
  const PID = 'proj-1' as ProjectId

  beforeEach(() => {
    service = new MockDashboardService()
  })

  it('getSummary() returns dashboard summary with correct shape', async () => {
    const summary = await service.getSummary(PID)
    expect(summary.todayTokens).toBeDefined()
    expect(summary.todayTokens.total).toBeGreaterThanOrEqual(0)
    expect(summary.todayTokens.input).toBeGreaterThanOrEqual(0)
    expect(summary.todayTokens.output).toBeGreaterThanOrEqual(0)
    expect(summary.totalAgents).toBeGreaterThanOrEqual(0)
    expect(summary.activeChats).toBeGreaterThanOrEqual(0)
    expect(summary.totalChats).toBeGreaterThanOrEqual(0)
  })

  it('getAgentStats() returns agent stats array', async () => {
    const stats = await service.getAgentStats(PID)
    expect(Array.isArray(stats)).toBe(true)
    stats.forEach(a => {
      expect(a.agentId).toBeTruthy()
      expect(a.projectName).toBeTruthy()
      expect(a.agentName).toBeTruthy()
      expect(a.model).toBeTruthy()
      expect(a.totalTokens).toBeGreaterThanOrEqual(0)
    })
  })

  it('getRecentChats() returns recent chats array', async () => {
    const chats = await service.getRecentChats(PID)
    expect(Array.isArray(chats)).toBe(true)
    chats.forEach(c => {
      expect(c.conversationId).toBeTruthy()
      expect(c.title).toBeTruthy()
      expect(c.messageCount).toBeGreaterThanOrEqual(0)
    })
  })

  it('getRecentChats() respects limit', async () => {
    const chats = await service.getRecentChats(PID, 1)
    expect(chats.length).toBeLessThanOrEqual(1)
  })

  it('getTokenTrend() returns daily token data', async () => {
    const trend = await service.getTokenTrend(PID)
    expect(Array.isArray(trend)).toBe(true)
    trend.forEach(d => {
      expect(d.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(d.inputTokens).toBeGreaterThanOrEqual(0)
      expect(d.outputTokens).toBeGreaterThanOrEqual(0)
    })
  })

  it('getTokenTrend() respects days parameter', async () => {
    const trend = await service.getTokenTrend(PID, 7)
    expect(trend.length).toBeLessThanOrEqual(7)
  })
})
