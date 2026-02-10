import { describe, it, expect, beforeEach } from 'vitest'
import type { ProjectId, AgentId, ConversationId } from '@solocraft/shared'
import {
  MockProjectService,
  MockAgentService,
  MockConversationService,
  MockTaskService,
  MockArtifactService,
  MockMemoryService,
  MockSettingsService,
} from './services'

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

  it('list() filters by projectId', async () => {
    const tasks = await service.list('proj-1' as ProjectId)
    expect(tasks.length).toBeGreaterThan(0)
    tasks.forEach(t => expect(t.projectId).toBe('proj-1'))
  })

  it('getById() returns task', async () => {
    const task = await service.getById('proj-1' as ProjectId, 'task-1' as any)
    expect(task).not.toBeNull()
    expect(task!.title).toBe('Draft blog post')
  })

  it('cancel() changes task status', async () => {
    await service.cancel('proj-1' as ProjectId, 'task-1' as any)
    const task = await service.getById('proj-1' as ProjectId, 'task-1' as any)
    expect(task!.status).toBe('cancelled')
  })
})

describe('MockArtifactService', () => {
  let service: MockArtifactService

  beforeEach(() => {
    service = new MockArtifactService()
  })

  it('list() filters by projectId', async () => {
    const artifacts = await service.list('proj-1' as ProjectId)
    artifacts.forEach(a => expect(a.projectId).toBe('proj-1'))
  })

  it('getById() returns artifact', async () => {
    const artifact = await service.getById('proj-1' as ProjectId, 'artifact-1' as any)
    expect(artifact).not.toBeNull()
    expect(artifact!.title).toBe('Competitor Analysis Report')
  })

  it('delete() removes artifact', async () => {
    await service.delete('proj-1' as ProjectId, 'artifact-1' as any)
    const artifact = await service.getById('proj-1' as ProjectId, 'artifact-1' as any)
    expect(artifact).toBeNull()
  })
})

describe('MockMemoryService', () => {
  let service: MockMemoryService

  beforeEach(() => {
    service = new MockMemoryService()
  })

  it('list() filters by projectId', async () => {
    const memories = await service.list('proj-1' as ProjectId)
    expect(memories.length).toBeGreaterThan(0)
    memories.forEach(m => expect(m.projectId).toBe('proj-1'))
  })

  it('create() creates a new memory entry', async () => {
    const entry = await service.create('proj-1' as ProjectId, {
      content: 'New memory',
      source: 'Test',
      tags: ['test'],
    })
    expect(entry.content).toBe('New memory')
    expect(entry.projectId).toBe('proj-1')
  })

  it('update() modifies a memory entry', async () => {
    const entries = await service.list('proj-1' as ProjectId)
    const updated = await service.update('proj-1' as ProjectId, entries[0].id, {
      content: 'Updated content',
    })
    expect(updated.content).toBe('Updated content')
  })

  it('update() throws for wrong projectId', async () => {
    await expect(
      service.update('proj-2' as ProjectId, 'mem-1' as any, { content: 'Bad' }),
    ).rejects.toThrow('not found')
  })

  it('delete() removes memory entry', async () => {
    const entries = await service.list('proj-1' as ProjectId)
    await service.delete('proj-1' as ProjectId, entries[0].id)
    const remaining = await service.list('proj-1' as ProjectId)
    expect(remaining).toHaveLength(entries.length - 1)
  })
})

describe('MockSettingsService', () => {
  let service: MockSettingsService

  beforeEach(() => {
    service = new MockSettingsService()
  })

  it('get() returns settings', async () => {
    const settings = await service.get()
    expect(settings.defaultProvider).toBe('openai')
    expect(settings.theme).toBe('dark')
  })

  it('update() merges settings', async () => {
    const updated = await service.update({ defaultProvider: 'anthropic' })
    expect(updated.defaultProvider).toBe('anthropic')
    expect(updated.theme).toBe('dark') // unchanged

    // Verify persistence
    const fetched = await service.get()
    expect(fetched.defaultProvider).toBe('anthropic')
  })
})
