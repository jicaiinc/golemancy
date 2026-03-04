import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./skills', () => ({
  loadAgentSkillTools: vi.fn().mockResolvedValue(null),
}))
vi.mock('./mcp', () => ({
  loadAgentMcpTools: vi.fn().mockResolvedValue({ tools: {}, warnings: [] }),
}))
vi.mock('./builtin-tools', () => ({
  loadBuiltinTools: vi.fn().mockResolvedValue(null),
}))
vi.mock('./resolve-permissions', () => ({
  resolvePermissionsConfig: vi.fn().mockResolvedValue({
    mode: 'sandbox',
    config: {
      allowWrite: [],
      denyRead: [],
      denyWrite: [],
      networkRestrictionsEnabled: false,
      allowedDomains: [],
      deniedDomains: [],
      deniedCommands: [],
      applyToMCP: false,
    },
  }),
}))
vi.mock('../utils/paths', () => ({
  getProjectPath: vi.fn().mockReturnValue('/tmp/test-project'),
}))

import { loadAgentTools } from './tools'
import { loadAgentSkillTools } from './skills'
import { loadAgentMcpTools } from './mcp'
import { loadBuiltinTools } from './builtin-tools'
import type { Agent, GlobalSettings, AgentId, ProjectId, IMCPService, IPermissionsConfigService, MCPServerConfig, TeamMember } from '@golemancy/shared'

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
    mcpServers: [],
    builtinTools: { bash: true },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

const defaultSettings: GlobalSettings = {
  providers: {
    openai: { name: 'OpenAI', sdkType: 'openai' as const, apiKey: 'test-key', models: ['gpt-4o'] },
  },
  theme: 'dark',
}

function makeMockPermissionsConfigStorage(): IPermissionsConfigService {
  return {
    list: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    duplicate: vi.fn(),
  }
}

function makeMockMcpStorage(configs: MCPServerConfig[] = []): IMCPService {
  return {
    list: vi.fn().mockResolvedValue(configs),
    getByName: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    resolveNames: vi.fn().mockImplementation(async (_pid: string, names: string[]) =>
      configs.filter(c => names.includes(c.name)),
    ),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadAgentTools', () => {
  it('returns empty tools and instructions for a bare agent', async () => {
    const agent = makeAgent({ skillIds: [], mcpServers: [], builtinTools: undefined as never })
    // builtinTools is truthy so loadBuiltinTools will be called but returns null
    const result = await loadAgentTools({
      agent: makeAgent({ skillIds: [], mcpServers: [] }),
      projectId: 'proj-1',
      settings: defaultSettings,
      allAgents: [],
      mcpStorage: makeMockMcpStorage(),
      permissionsConfigStorage: makeMockPermissionsConfigStorage(),
    })

    expect(result.tools).toEqual({})
    expect(result.instructions).toBe('')
    expect(result.cleanup).toBeTypeOf('function')
  })

  it('loads skill tools and captures instructions', async () => {
    const mockSkillCleanup = vi.fn().mockResolvedValue(undefined)
    vi.mocked(loadAgentSkillTools).mockResolvedValueOnce({
      tools: { skill: {} as never },
      instructions: 'Use skill X for research',
      cleanup: mockSkillCleanup,
    })

    const agent = makeAgent({ skillIds: ['skill-1'] })
    const result = await loadAgentTools({
      agent,
      projectId: 'proj-1',
      settings: defaultSettings,
      allAgents: [],
      mcpStorage: makeMockMcpStorage(),
      permissionsConfigStorage: makeMockPermissionsConfigStorage(),
    })

    expect(loadAgentSkillTools).toHaveBeenCalledWith('proj-1', ['skill-1'])
    expect(result.tools).toHaveProperty('skill')
    // skills no longer produce bash tools
    expect(result.instructions).toBe('Use skill X for research')

    await result.cleanup()
    expect(mockSkillCleanup).toHaveBeenCalled()
  })

  it('loads MCP tools', async () => {
    vi.mocked(loadAgentMcpTools).mockResolvedValueOnce({
      tools: { mcp_search: {} as never },
      warnings: [],
    })

    const mcpConfigs: MCPServerConfig[] = [{ name: 'test', enabled: true, transportType: 'stdio', command: 'echo' }]
    const agent = makeAgent({ mcpServers: ['test'] })
    const mockStorage = makeMockMcpStorage(mcpConfigs)
    const result = await loadAgentTools({
      agent,
      projectId: 'proj-1',
      settings: defaultSettings,
      allAgents: [],
      mcpStorage: mockStorage,
      permissionsConfigStorage: makeMockPermissionsConfigStorage(),
    })

    expect(mockStorage.resolveNames).toHaveBeenCalledWith('proj-1', ['test'])
    expect(loadAgentMcpTools).toHaveBeenCalledWith(mcpConfigs, expect.objectContaining({
      projectId: 'proj-1',
      workspaceDir: '/tmp/test-project/workspace',
      resolvedPermissions: expect.objectContaining({ mode: 'sandbox' }),
    }))
    expect(result.tools).toHaveProperty('mcp_search')

    // MCP cleanup is managed by the pool — no cleanup pushed
    await result.cleanup()
  })

  it('loads built-in tools', async () => {
    const mockBuiltinCleanup = vi.fn().mockResolvedValue(undefined)
    vi.mocked(loadBuiltinTools).mockResolvedValueOnce({
      tools: { execute: {} as never },
      actualMode: 'restricted',
      cleanup: mockBuiltinCleanup,
    })

    const agent = makeAgent({ builtinTools: { bash: true } })
    const mockPermsStorage = makeMockPermissionsConfigStorage()
    const result = await loadAgentTools({
      agent,
      projectId: 'proj-1',
      settings: defaultSettings,
      allAgents: [],
      mcpStorage: makeMockMcpStorage(),
      permissionsConfigStorage: mockPermsStorage,
    })

    expect(loadBuiltinTools).toHaveBeenCalledWith({ bash: true }, {
      projectId: 'proj-1',
      permissionsConfigId: undefined,
      permissionsConfigStorage: mockPermsStorage,
    })
    expect(result.tools).toHaveProperty('execute')

    await result.cleanup()
    expect(mockBuiltinCleanup).toHaveBeenCalled()
  })

  it('creates sub-agent delegate tools without preloading', async () => {
    const child = makeAgent({ id: 'agent-child' as AgentId, name: 'Researcher', description: 'Finds info' })
    const parent = makeAgent()

    const result = await loadAgentTools({
      agent: parent,
      projectId: 'proj-1',
      settings: defaultSettings,
      allAgents: [parent, child],
      mcpStorage: makeMockMcpStorage(),
      permissionsConfigStorage: makeMockPermissionsConfigStorage(),
      teamMembers: [{ agentId: 'agent-child' as AgentId, role: 'research', parentAgentId: parent.id }],
    })

    // Sub-agent tool should be created as a lightweight shell
    expect(result.tools).toHaveProperty('delegate_to_agent-child')
    // Skills/MCP/builtin for the child should NOT have been called (lazy loading)
    // loadAgentSkillTools was only called if parent had skills (it doesn't)
    expect(loadAgentSkillTools).not.toHaveBeenCalled()
  })

  it('merges tools from all sources', async () => {
    vi.mocked(loadAgentSkillTools).mockResolvedValueOnce({
      tools: { skill: {} as never },
      instructions: 'skill instructions',
      cleanup: vi.fn(),
    })
    vi.mocked(loadAgentMcpTools).mockResolvedValueOnce({
      tools: { mcp_tool: {} as never },
      warnings: [],
    })
    vi.mocked(loadBuiltinTools).mockResolvedValueOnce({
      tools: { execute: {} as never },
      actualMode: 'restricted',
      cleanup: vi.fn(),
    })

    const child = makeAgent({ id: 'agent-child' as AgentId, name: 'Helper', description: 'Helps' })
    const mcpConfigs: MCPServerConfig[] = [{ name: 'test', enabled: true, transportType: 'stdio', command: 'echo' }]
    const agent = makeAgent({
      skillIds: ['s1'],
      mcpServers: ['test'],
      builtinTools: { bash: true },
    })

    const mockPermsStorage = makeMockPermissionsConfigStorage()
    const result = await loadAgentTools({
      agent,
      projectId: 'proj-1',
      settings: defaultSettings,
      allAgents: [agent, child],
      mcpStorage: makeMockMcpStorage(mcpConfigs),
      permissionsConfigStorage: mockPermsStorage,
      teamMembers: [{ agentId: 'agent-child' as AgentId, role: 'help', parentAgentId: agent.id }],
    })

    expect(Object.keys(result.tools)).toHaveLength(4)
    expect(result.tools).toHaveProperty('skill')
    expect(result.tools).toHaveProperty('mcp_tool')
    expect(result.tools).toHaveProperty('execute')
    expect(result.tools).toHaveProperty('delegate_to_agent-child')
    // Instructions include skill instructions + bash environment instructions
    expect(result.instructions).toContain('skill instructions')
    expect(result.instructions).toContain('## Bash Environment')

    // Skills and bash are fully decoupled — no skill data passed to builtin
    expect(loadBuiltinTools).toHaveBeenCalledWith({ bash: true }, {
      projectId: 'proj-1',
      permissionsConfigId: undefined,
      permissionsConfigStorage: mockPermsStorage,
    })
  })

  it('cleanup calls all registered cleanups even if one fails', async () => {
    const cleanup1 = vi.fn().mockRejectedValue(new Error('fail'))
    const cleanup2 = vi.fn().mockResolvedValue(undefined)
    vi.mocked(loadAgentSkillTools).mockResolvedValueOnce({
      tools: { skill: {} as never },
      instructions: '',
      cleanup: cleanup1,
    })
    vi.mocked(loadBuiltinTools).mockResolvedValueOnce({
      tools: { bash: {} as never },
      actualMode: 'restricted',
      cleanup: cleanup2,
    })

    const agent = makeAgent({ skillIds: ['s1'], builtinTools: { bash: true } })
    const result = await loadAgentTools({
      agent,
      projectId: 'proj-1',
      settings: defaultSettings,
      allAgents: [],
      mcpStorage: makeMockMcpStorage(),
      permissionsConfigStorage: makeMockPermissionsConfigStorage(),
    })

    await result.cleanup()
    expect(cleanup1).toHaveBeenCalled()
    expect(cleanup2).toHaveBeenCalled()
  })
})
