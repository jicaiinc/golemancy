import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./skills', () => ({
  loadAgentSkillTools: vi.fn().mockResolvedValue(null),
}))
vi.mock('./mcp', () => ({
  loadAgentMcpTools: vi.fn().mockResolvedValue(null),
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
      allowedDomains: ['*'],
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
import type { Agent, GlobalSettings, AgentId, ProjectId, IMCPService, IPermissionsConfigService, MCPServerConfig } from '@golemancy/shared'

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
    const agent = makeAgent({ skillIds: [], mcpServers: [], subAgents: [], builtinTools: undefined as never })
    // builtinTools is truthy so loadBuiltinTools will be called but returns null
    const result = await loadAgentTools({
      agent: makeAgent({ skillIds: [], mcpServers: [], subAgents: [] }),
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
    const mockMcpCleanup = vi.fn().mockResolvedValue(undefined)
    vi.mocked(loadAgentMcpTools).mockResolvedValueOnce({
      tools: { mcp_search: {} as never },
      cleanup: mockMcpCleanup,
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
      resolvedPermissions: expect.objectContaining({ mode: 'sandbox' }),
    }))
    expect(result.tools).toHaveProperty('mcp_search')

    await result.cleanup()
    expect(mockMcpCleanup).toHaveBeenCalled()
  })

  it('loads built-in tools', async () => {
    const mockBuiltinCleanup = vi.fn().mockResolvedValue(undefined)
    vi.mocked(loadBuiltinTools).mockResolvedValueOnce({
      tools: { execute: {} as never },
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
    const parent = makeAgent({
      subAgents: [{ agentId: 'agent-child' as AgentId, role: 'research' }],
    })

    const result = await loadAgentTools({
      agent: parent,
      projectId: 'proj-1',
      settings: defaultSettings,
      allAgents: [parent, child],
      mcpStorage: makeMockMcpStorage(),
      permissionsConfigStorage: makeMockPermissionsConfigStorage(),
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
      cleanup: vi.fn(),
    })
    vi.mocked(loadBuiltinTools).mockResolvedValueOnce({
      tools: { execute: {} as never },
      cleanup: vi.fn(),
    })

    const child = makeAgent({ id: 'agent-child' as AgentId, name: 'Helper', description: 'Helps' })
    const mcpConfigs: MCPServerConfig[] = [{ name: 'test', enabled: true, transportType: 'stdio', command: 'echo' }]
    const agent = makeAgent({
      skillIds: ['s1'],
      mcpServers: ['test'],
      builtinTools: { bash: true },
      subAgents: [{ agentId: 'agent-child' as AgentId, role: 'help' }],
    })

    const mockPermsStorage = makeMockPermissionsConfigStorage()
    const result = await loadAgentTools({
      agent,
      projectId: 'proj-1',
      settings: defaultSettings,
      allAgents: [agent, child],
      mcpStorage: makeMockMcpStorage(mcpConfigs),
      permissionsConfigStorage: mockPermsStorage,
    })

    expect(Object.keys(result.tools)).toHaveLength(4)
    expect(result.tools).toHaveProperty('skill')
    expect(result.tools).toHaveProperty('mcp_tool')
    expect(result.tools).toHaveProperty('execute')
    expect(result.tools).toHaveProperty('delegate_to_agent-child')
    expect(result.instructions).toBe('skill instructions')

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
