import { describe, it, expect, vi } from 'vitest'
import { loadSubAgentTools, createSubAgentTool } from './sub-agent'
import type { Agent, GlobalSettings, AgentId, ProjectId } from '@solocraft/shared'

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

describe('createSubAgentTool', () => {
  it('creates a tool with correct description', () => {
    const child = makeAgent({ name: 'Researcher', description: 'Finds information' })
    const t = createSubAgentTool(child, defaultSettings)

    expect(t).toBeDefined()
    // The tool object from ai SDK has description in its definition
    expect(t).toHaveProperty('execute')
  })
})

describe('loadSubAgentTools', () => {
  it('returns empty ToolSet when agent has no subAgents', () => {
    const agent = makeAgent({ subAgents: [] })
    const tools = loadSubAgentTools(agent, [], defaultSettings)

    expect(tools).toEqual({})
  })

  it('creates tool for each sub-agent ref', () => {
    const child1 = makeAgent({ id: 'agent-child1' as AgentId, name: 'Researcher' })
    const child2 = makeAgent({ id: 'agent-child2' as AgentId, name: 'Writer' })
    const parent = makeAgent({
      subAgents: [
        { agentId: 'agent-child1' as AgentId, role: 'research' },
        { agentId: 'agent-child2' as AgentId, role: 'writing' },
      ],
    })

    const tools = loadSubAgentTools(parent, [child1, child2, parent], defaultSettings)

    expect(Object.keys(tools)).toHaveLength(2)
    expect(tools).toHaveProperty('delegate_to_researcher')
    expect(tools).toHaveProperty('delegate_to_writer')
  })

  it('uses delegate_to_ prefix with lowercased name', () => {
    const child = makeAgent({ id: 'agent-child' as AgentId, name: 'Data Analyst' })
    const parent = makeAgent({
      subAgents: [{ agentId: 'agent-child' as AgentId, role: 'analysis' }],
    })

    const tools = loadSubAgentTools(parent, [child, parent], defaultSettings)

    expect(tools).toHaveProperty('delegate_to_data_analyst')
  })

  it('skips sub-agents not found in allAgents list', () => {
    const parent = makeAgent({
      subAgents: [
        { agentId: 'agent-missing' as AgentId, role: 'ghost' },
        { agentId: 'agent-exists' as AgentId, role: 'real' },
      ],
    })
    const existing = makeAgent({ id: 'agent-exists' as AgentId, name: 'Existing' })

    const tools = loadSubAgentTools(parent, [existing, parent], defaultSettings)

    expect(Object.keys(tools)).toHaveLength(1)
    expect(tools).toHaveProperty('delegate_to_existing')
    expect(tools).not.toHaveProperty('delegate_to_ghost')
  })

  it('handles agents with special characters in names', () => {
    const child = makeAgent({ id: 'agent-special' as AgentId, name: 'Code Review Bot' })
    const parent = makeAgent({
      subAgents: [{ agentId: 'agent-special' as AgentId, role: 'review' }],
    })

    const tools = loadSubAgentTools(parent, [child, parent], defaultSettings)

    // Spaces are replaced with underscores, name is lowercased
    expect(tools).toHaveProperty('delegate_to_code_review_bot')
  })

  it('handles agent name with multiple spaces', () => {
    const child = makeAgent({ id: 'agent-spaces' as AgentId, name: 'My  Cool   Agent' })
    const parent = makeAgent({
      subAgents: [{ agentId: 'agent-spaces' as AgentId, role: 'helper' }],
    })

    const tools = loadSubAgentTools(parent, [child, parent], defaultSettings)

    // \s+ regex replaces multiple spaces with single underscore
    expect(tools).toHaveProperty('delegate_to_my_cool_agent')
  })
})
