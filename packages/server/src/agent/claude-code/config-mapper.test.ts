import { describe, it, expect } from 'vitest'
import { buildSdkOptions, type BuildSdkOptionsParams } from './config-mapper'
import type { Agent, AgentId, ProjectId, MCPServerConfig } from '@golemancy/shared'

const now = new Date().toISOString()

function makeAgent(overrides?: Partial<Agent>): Agent {
  return {
    id: 'agent-1' as AgentId,
    projectId: 'proj-1' as ProjectId,
    name: 'Test Agent',
    description: 'A test agent',
    status: 'idle',
    systemPrompt: 'You are helpful.',
    modelConfig: { provider: 'anthropic', model: 'sonnet' },
    skillIds: [],
    tools: [],
    subAgents: [],
    mcpServers: [],
    builtinTools: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeParams(overrides?: Partial<BuildSdkOptionsParams>): BuildSdkOptionsParams {
  return {
    agent: makeAgent(),
    systemPrompt: 'You are helpful.',
    cwd: '/workspace',
    allAgents: [],
    mcpConfigs: [],
    ...overrides,
  }
}

describe('buildSdkOptions', () => {
  describe('basic options', () => {
    it('always sets includePartialMessages to true', () => {
      const result = buildSdkOptions(makeParams())
      expect(result.includePartialMessages).toBe(true)
    })

    it('sets cwd from params', () => {
      const result = buildSdkOptions(makeParams({ cwd: '/my/workspace' }))
      expect(result.cwd).toBe('/my/workspace')
    })

    it('omits cwd when not provided', () => {
      const result = buildSdkOptions(makeParams({ cwd: undefined }))
      expect(result.cwd).toBeUndefined()
    })

    it('sets systemPrompt', () => {
      const result = buildSdkOptions(makeParams({ systemPrompt: 'Custom prompt' }))
      expect(result.systemPrompt).toBe('Custom prompt')
    })

    it('omits systemPrompt when empty', () => {
      const result = buildSdkOptions(makeParams({ systemPrompt: '' }))
      expect(result.systemPrompt).toBeUndefined()
    })
  })

  describe('model normalization', () => {
    it('passes valid claude-code models through (sonnet, opus, haiku)', () => {
      for (const model of ['sonnet', 'opus', 'haiku']) {
        const result = buildSdkOptions(makeParams({
          agent: makeAgent({ modelConfig: { provider: 'anthropic', model } }),
        }))
        expect(result.model).toBe(model)
      }
    })

    it('falls back to "sonnet" for invalid model (e.g. gpt-4o)', () => {
      const result = buildSdkOptions(makeParams({
        agent: makeAgent({ modelConfig: { provider: 'openai', model: 'gpt-4o' } }),
      }))
      expect(result.model).toBe('sonnet')
    })

    it('falls back to "sonnet" when model is undefined', () => {
      const result = buildSdkOptions(makeParams({
        agent: makeAgent({ modelConfig: { provider: 'anthropic', model: '' } }),
      }))
      expect(result.model).toBe('sonnet')
    })
  })

  describe('builtin tool mapping', () => {
    it('maps bash to Bash, Read, Write, Edit, Glob, Grep', () => {
      const result = buildSdkOptions(makeParams({
        agent: makeAgent({ builtinTools: { bash: true } }),
      }))
      expect(result.allowedTools).toEqual(
        expect.arrayContaining(['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep']),
      )
    })

    it('maps browser to WebFetch, WebSearch', () => {
      const result = buildSdkOptions(makeParams({
        agent: makeAgent({ builtinTools: { browser: true } }),
      }))
      expect(result.allowedTools).toEqual(
        expect.arrayContaining(['WebFetch', 'WebSearch']),
      )
    })

    it('maps task to Task', () => {
      const result = buildSdkOptions(makeParams({
        agent: makeAgent({ builtinTools: { task: true } }),
      }))
      expect(result.allowedTools).toEqual(
        expect.arrayContaining(['Task']),
      )
    })

    it('skips disabled builtinTools', () => {
      const result = buildSdkOptions(makeParams({
        agent: makeAgent({ builtinTools: { bash: false, browser: false } }),
      }))
      expect(result.allowedTools).toBeUndefined()
    })

    it('does not set allowedTools when no tools enabled', () => {
      const result = buildSdkOptions(makeParams({
        agent: makeAgent({ builtinTools: {} }),
      }))
      expect(result.allowedTools).toBeUndefined()
    })
  })

  describe('permission mode mapping', () => {
    it('maps "sandbox" to "default"', () => {
      const result = buildSdkOptions(makeParams({ permissionMode: 'sandbox' }))
      expect(result.permissionMode).toBe('default')
      expect(result.allowDangerouslySkipPermissions).toBeUndefined()
    })

    it('maps "restricted" to "plan"', () => {
      const result = buildSdkOptions(makeParams({ permissionMode: 'restricted' }))
      expect(result.permissionMode).toBe('plan')
    })

    it('maps "unrestricted" to "bypassPermissions" with dangerous flag', () => {
      const result = buildSdkOptions(makeParams({ permissionMode: 'unrestricted' }))
      expect(result.permissionMode).toBe('bypassPermissions')
      expect(result.allowDangerouslySkipPermissions).toBe(true)
    })

    it('defaults to "default" when permissionMode is undefined', () => {
      const result = buildSdkOptions(makeParams({ permissionMode: undefined }))
      expect(result.permissionMode).toBe('default')
    })
  })

  describe('session resume', () => {
    it('sets resume when sdkSessionId is provided', () => {
      const result = buildSdkOptions(makeParams({ sdkSessionId: 'session-abc' }))
      expect(result.resume).toBe('session-abc')
    })

    it('does not set resume when sdkSessionId is undefined', () => {
      const result = buildSdkOptions(makeParams({ sdkSessionId: undefined }))
      expect(result.resume).toBeUndefined()
    })
  })

  describe('sub-agents', () => {
    it('maps sub-agents to SDK agent definitions', () => {
      const mainAgent = makeAgent({
        subAgents: [{ agentId: 'agent-2' as AgentId, role: 'helper' }],
      })
      const subAgent = makeAgent({
        id: 'agent-2' as AgentId,
        name: 'Helper',
        description: 'A helper agent',
        systemPrompt: 'Help the user.',
        modelConfig: { provider: 'anthropic', model: 'haiku' },
        builtinTools: { bash: true },
      })

      const result = buildSdkOptions(makeParams({
        agent: mainAgent,
        allAgents: [mainAgent, subAgent],
      }))

      expect(result.agents).toEqual({
        Helper: {
          description: 'A helper agent',
          prompt: 'Help the user.',
          tools: expect.arrayContaining(['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep']),
          model: 'haiku',
        },
      })
      // Task tool should be added for sub-agent support
      expect(result.allowedTools).toContain('Task')
    })

    it('skips sub-agents not found in allAgents', () => {
      const mainAgent = makeAgent({
        subAgents: [{ agentId: 'agent-missing' as AgentId, role: 'helper' }],
      })

      const result = buildSdkOptions(makeParams({
        agent: mainAgent,
        allAgents: [mainAgent],
      }))

      expect(result.agents).toBeUndefined()
    })

    it('does not duplicate Task in allowedTools when already present', () => {
      const mainAgent = makeAgent({
        builtinTools: { task: true },
        subAgents: [{ agentId: 'agent-2' as AgentId, role: 'helper' }],
      })
      const subAgent = makeAgent({ id: 'agent-2' as AgentId, name: 'Sub' })

      const result = buildSdkOptions(makeParams({
        agent: mainAgent,
        allAgents: [mainAgent, subAgent],
      }))

      const taskCount = result.allowedTools!.filter(t => t === 'Task').length
      expect(taskCount).toBe(1)
    })
  })

  describe('MCP servers', () => {
    it('adds wildcard allowedTools for each MCP server', () => {
      const mcpConfigs: MCPServerConfig[] = [
        {
          name: 'filesystem',
          enabled: true,
          transportType: 'stdio',
          command: 'node',
          args: ['server.js'],
        } as MCPServerConfig,
      ]

      const result = buildSdkOptions(makeParams({ mcpConfigs }))
      expect(result.allowedTools).toContain('mcp__filesystem__*')
      expect(result.mcpServers).toHaveProperty('filesystem')
    })
  })

  describe('skills', () => {
    it('sets settingSources to ["project"] when hasSkills is true', () => {
      const result = buildSdkOptions(makeParams({ hasSkills: true }))
      expect(result.settingSources).toEqual(['project'])
      expect(result.allowedTools).toContain('Skill')
    })

    it('does not set settingSources when hasSkills is false', () => {
      const result = buildSdkOptions(makeParams({ hasSkills: false }))
      expect(result.settingSources).toBeUndefined()
    })
  })
})
