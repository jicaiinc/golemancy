import { describe, it, expect, vi } from 'vitest'

import { createSubAgentToolSet, createSubAgentTool, sanitizeToolName } from './sub-agent'
import type { Agent, GlobalSettings, AgentId, ProjectId } from '@golemancy/shared'
import type { LoadAgentToolsParams, AgentToolsResult } from './tools'

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1' as AgentId,
    projectId: 'proj-1' as ProjectId,
    name: 'Test Agent',
    description: 'A test agent',
    status: 'idle',
    systemPrompt: 'You are helpful',
    modelConfig: { provider: 'openai', model: 'gpt-4o' },
    skillIds: [],
    tools: [],
    subAgents: [],
    mcpServers: [],
    builtinTools: { bash: true },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

const defaultSettings: GlobalSettings = {
  providers: [
    { provider: 'openai', apiKey: 'test-key', defaultModel: 'gpt-4o' },
  ],
  defaultProvider: 'openai',
  theme: 'dark',
  userProfile: { name: '', email: '' },
  defaultWorkingDirectoryBase: '',
}

const mockLoadTools = vi.fn<(params: LoadAgentToolsParams) => Promise<AgentToolsResult>>()
  .mockResolvedValue({
    tools: {},
    instructions: '',
    cleanup: vi.fn(),
  })

describe('sanitizeToolName', () => {
  it('passes through valid names', () => {
    expect(sanitizeToolName('delegate_to_writer')).toBe('delegate_to_writer')
  })

  it('replaces spaces with underscores', () => {
    expect(sanitizeToolName('delegate_to_team lead')).toBe('delegate_to_team_lead')
  })

  it('collapses consecutive underscores', () => {
    expect(sanitizeToolName('delegate_to_my__cool___agent')).toBe('delegate_to_my_cool_agent')
  })

  it('prepends underscore if starts with number', () => {
    expect(sanitizeToolName('123tool')).toBe('_123tool')
  })

  it('returns unnamed_tool for empty string', () => {
    expect(sanitizeToolName('')).toBe('unnamed_tool')
  })

  it('trims trailing underscore', () => {
    expect(sanitizeToolName('delegate_to_')).toBe('delegate_to')
  })

  it('truncates to 64 chars', () => {
    const long = 'a'.repeat(100)
    expect(sanitizeToolName(long).length).toBe(64)
  })
})

describe('createSubAgentTool', () => {
  it('creates a tool with execute function', () => {
    const child = makeAgent({ name: 'Researcher', description: 'Finds information' })
    const t = createSubAgentTool(child, [child], defaultSettings, 'proj-1', mockLoadTools)

    expect(t).toBeDefined()
    expect(t).toHaveProperty('execute')
  })
})

describe('createSubAgentToolSet', () => {
  it('returns empty tools when agent has no subAgents', () => {
    const agent = makeAgent({ subAgents: [] })
    const result = createSubAgentToolSet(agent, [], defaultSettings, 'proj-1', mockLoadTools)

    expect(result.tools).toEqual({})
  })

  it('creates tool for each sub-agent ref using agent ID', () => {
    const child1 = makeAgent({ id: 'agent-child1' as AgentId, name: 'Researcher' })
    const child2 = makeAgent({ id: 'agent-child2' as AgentId, name: 'Writer' })
    const parent = makeAgent({
      subAgents: [
        { agentId: 'agent-child1' as AgentId, role: 'research' },
        { agentId: 'agent-child2' as AgentId, role: 'writing' },
      ],
    })

    const result = createSubAgentToolSet(parent, [child1, child2, parent], defaultSettings, 'proj-1', mockLoadTools)

    expect(Object.keys(result.tools)).toHaveLength(2)
    expect(result.tools).toHaveProperty('delegate_to_agent-child1')
    expect(result.tools).toHaveProperty('delegate_to_agent-child2')
  })

  it('works with non-ASCII agent names by using ID', () => {
    const child = makeAgent({ id: 'agent-cn' as AgentId, name: '蔡永吉' })
    const parent = makeAgent({
      subAgents: [{ agentId: 'agent-cn' as AgentId, role: 'assistant' }],
    })

    const result = createSubAgentToolSet(parent, [child, parent], defaultSettings, 'proj-1', mockLoadTools)

    expect(result.tools).toHaveProperty('delegate_to_agent-cn')
  })

  it('skips sub-agents not found in allAgents list', () => {
    const parent = makeAgent({
      subAgents: [
        { agentId: 'agent-missing' as AgentId, role: 'ghost' },
        { agentId: 'agent-exists' as AgentId, role: 'real' },
      ],
    })
    const existing = makeAgent({ id: 'agent-exists' as AgentId, name: 'Existing' })

    const result = createSubAgentToolSet(parent, [existing, parent], defaultSettings, 'proj-1', mockLoadTools)

    expect(Object.keys(result.tools)).toHaveLength(1)
    expect(result.tools).toHaveProperty('delegate_to_agent-exists')
  })

  it('does not call loadTools during creation (lazy loading)', () => {
    const child = makeAgent({ id: 'agent-child' as AgentId, name: 'Helper' })
    const parent = makeAgent({
      subAgents: [{ agentId: 'agent-child' as AgentId, role: 'help' }],
    })

    createSubAgentToolSet(parent, [child, parent], defaultSettings, 'proj-1', mockLoadTools)

    expect(mockLoadTools).not.toHaveBeenCalled()
  })
})
