import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createTmpDir } from '../test/helpers'

const state = vi.hoisted(() => ({ tmpDir: '' }))

vi.mock('../utils/paths', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/paths')>()
  return {
    ...actual,
    getDataDir: () => state.tmpDir,
    getProjectPath: (pid: string) => `${state.tmpDir}/projects/${pid}`,
  }
})

import { instantiateProjectTemplate } from './template-instantiate'

describe('instantiateProjectTemplate', () => {
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    const tmp = await createTmpDir()
    state.tmpDir = tmp.dir
    cleanup = tmp.cleanup
  })

  afterEach(async () => {
    await cleanup()
  })

  describe('writing-assistant template', () => {
    const defaultModel = { provider: 'anthropic', model: 'claude-sonnet-4-20250514' } as const

    it('creates project with correct fields', async () => {
      const project = await instantiateProjectTemplate(
        'writing-assistant',
        'My Writing Project',
        defaultModel,
      )

      expect(project.id).toMatch(/^proj-/)
      expect(project.name).toBe('My Writing Project')
      expect(project.description).toBe('AI writing expert for emails, blogs, social media, and all types of content')
      expect(project.icon).toBe('book')
      expect(project.agentCount).toBe(1)
      expect(project.defaultTargetType).toBe('agent')
      expect(project.defaultTargetId).toBeTruthy()
    })

    it('creates all 5 skills with SKILL.md and metadata.json', async () => {
      const project = await instantiateProjectTemplate('writing-assistant', 'Test', defaultModel)

      const skillsDir = path.join(state.tmpDir, 'projects', project.id, 'skills')
      const skillDirs = await fs.readdir(skillsDir)
      expect(skillDirs).toHaveLength(5)

      for (const skillId of skillDirs) {
        const skillPath = path.join(skillsDir, skillId)
        const skillMd = await fs.readFile(path.join(skillPath, 'SKILL.md'), 'utf-8')
        expect(skillMd).toContain('---')
        expect(skillMd).toContain('name:')
        expect(skillMd).toContain('description:')

        const meta = JSON.parse(await fs.readFile(path.join(skillPath, 'metadata.json'), 'utf-8'))
        expect(meta.id).toMatch(/^skill-/)
        expect(meta.createdAt).toBeTruthy()
      }
    })

    it('creates agent with resolved skillIds and mcpServers', async () => {
      const project = await instantiateProjectTemplate('writing-assistant', 'Test', defaultModel)

      const agentsDir = path.join(state.tmpDir, 'projects', project.id, 'agents')
      const agentFiles = await fs.readdir(agentsDir)
      expect(agentFiles).toHaveLength(1)

      const agent = JSON.parse(await fs.readFile(path.join(agentsDir, agentFiles[0]), 'utf-8'))
      expect(agent.name).toBe('Writer')
      expect(agent.skillIds).toHaveLength(5)
      expect(agent.skillIds.every((id: string) => id.startsWith('skill-'))).toBe(true)
      expect(agent.mcpServers).toEqual(['fetch'])
      expect(agent.modelConfig).toEqual(defaultModel)
      expect(agent.builtinTools).toEqual({ bash: false, memory: true, browser: true, task: true })
    })

    it('creates mcp.json with fetch server', async () => {
      const project = await instantiateProjectTemplate('writing-assistant', 'Test', defaultModel)

      const mcpPath = path.join(state.tmpDir, 'projects', project.id, 'mcp.json')
      const mcpData = JSON.parse(await fs.readFile(mcpPath, 'utf-8'))
      expect(mcpData.mcpServers.fetch).toBeDefined()
      expect(mcpData.mcpServers.fetch.transportType).toBe('stdio')
      expect(mcpData.mcpServers.fetch.command).toBe('uvx')
      expect(mcpData.mcpServers.fetch.args).toEqual(['mcp-server-fetch'])
      expect(mcpData.mcpServers.fetch.enabled).toBe(true)
    })

    it('creates no teams or cronJobs', async () => {
      const project = await instantiateProjectTemplate('writing-assistant', 'Test', defaultModel)

      const teamsDir = path.join(state.tmpDir, 'projects', project.id, 'teams')
      const teamFiles = await fs.readdir(teamsDir)
      expect(teamFiles).toHaveLength(0)

      const cronDir = path.join(state.tmpDir, 'projects', project.id, 'cronjobs')
      const cronFiles = await fs.readdir(cronDir)
      expect(cronFiles).toHaveLength(0)
    })

    it('sets defaultTargetId to the writer agent', async () => {
      const project = await instantiateProjectTemplate('writing-assistant', 'Test', defaultModel)

      const agentsDir = path.join(state.tmpDir, 'projects', project.id, 'agents')
      const agentFiles = await fs.readdir(agentsDir)
      const agent = JSON.parse(await fs.readFile(path.join(agentsDir, agentFiles[0]), 'utf-8'))

      expect(project.defaultTargetType).toBe('agent')
      expect(project.defaultTargetId).toBe(agent.id)
    })
  })

  describe('deep-research template', () => {
    const defaultModel = { provider: 'openai', model: 'gpt-4o' } as const

    it('creates project with correct structure', async () => {
      const project = await instantiateProjectTemplate(
        'deep-research',
        'Research Project',
        defaultModel,
      )

      expect(project.id).toMatch(/^proj-/)
      expect(project.name).toBe('Research Project')
      expect(project.agentCount).toBe(3)
      expect(project.defaultTargetType).toBe('team')
      expect(project.defaultTargetId).toBeTruthy()
    })

    it('creates 4 skills', async () => {
      const project = await instantiateProjectTemplate('deep-research', 'Test', defaultModel)

      const skillsDir = path.join(state.tmpDir, 'projects', project.id, 'skills')
      const skillDirs = await fs.readdir(skillsDir)
      expect(skillDirs).toHaveLength(4)
    })

    it('creates 3 agents with correct skill and MCP references', async () => {
      const project = await instantiateProjectTemplate('deep-research', 'Test', defaultModel)

      const agentsDir = path.join(state.tmpDir, 'projects', project.id, 'agents')
      const agentFiles = await fs.readdir(agentsDir)
      expect(agentFiles).toHaveLength(3)

      const agents = await Promise.all(
        agentFiles.map(async f => JSON.parse(await fs.readFile(path.join(agentsDir, f), 'utf-8')))
      )

      const lead = agents.find((a: any) => a.name === 'Research Lead')!
      expect(lead).toBeDefined()
      expect(lead.skillIds).toHaveLength(3)
      expect(lead.mcpServers).toEqual(['open-websearch'])

      const researcher = agents.find((a: any) => a.name === 'Web Researcher')!
      expect(researcher).toBeDefined()
      expect(researcher.skillIds).toHaveLength(1)
      expect(researcher.mcpServers).toHaveLength(2)
      expect(researcher.mcpServers).toEqual(expect.arrayContaining(['open-websearch', 'playwright']))

      const analyst = agents.find((a: any) => a.name === 'Analyst')!
      expect(analyst).toBeDefined()
      expect(analyst.skillIds).toHaveLength(2)
      expect(analyst.mcpServers).toEqual(['sequential-thinking'])
    })

    it('creates team with correct member topology', async () => {
      const project = await instantiateProjectTemplate('deep-research', 'Test', defaultModel)

      const teamsDir = path.join(state.tmpDir, 'projects', project.id, 'teams')
      const teamFiles = await fs.readdir(teamsDir)
      expect(teamFiles).toHaveLength(1)

      const team = JSON.parse(await fs.readFile(path.join(teamsDir, teamFiles[0]), 'utf-8'))
      expect(team.name).toBe('Research Team')
      expect(team.members).toHaveLength(3)

      // Read agents to verify ID resolution
      const agentsDir = path.join(state.tmpDir, 'projects', project.id, 'agents')
      const agentFiles = await fs.readdir(agentsDir)
      const agents = await Promise.all(
        agentFiles.map(async f => JSON.parse(await fs.readFile(path.join(agentsDir, f), 'utf-8')))
      )
      const leadId = agents.find((a: any) => a.name === 'Research Lead')!.id

      // Root member (research-lead) has no parentAgentId
      const rootMember = team.members.find((m: any) => !m.parentAgentId)
      expect(rootMember).toBeDefined()
      expect(rootMember.agentId).toBe(leadId)

      // Child members have parentAgentId = leadId
      const childMembers = team.members.filter((m: any) => m.parentAgentId)
      expect(childMembers).toHaveLength(2)
      for (const member of childMembers) {
        expect(member.parentAgentId).toBe(leadId)
      }
    })

    it('creates mcp.json with 3 servers', async () => {
      const project = await instantiateProjectTemplate('deep-research', 'Test', defaultModel)

      const mcpPath = path.join(state.tmpDir, 'projects', project.id, 'mcp.json')
      const mcpData = JSON.parse(await fs.readFile(mcpPath, 'utf-8'))
      expect(Object.keys(mcpData.mcpServers)).toHaveLength(3)
      expect(mcpData.mcpServers['open-websearch']).toBeDefined()
      expect(mcpData.mcpServers['playwright']).toBeDefined()
      expect(mcpData.mcpServers['sequential-thinking']).toBeDefined()
    })

    it('creates cronJob targeting the team', async () => {
      const project = await instantiateProjectTemplate('deep-research', 'Test', defaultModel)

      const cronDir = path.join(state.tmpDir, 'projects', project.id, 'cronjobs')
      const cronFiles = await fs.readdir(cronDir)
      expect(cronFiles).toHaveLength(1)

      const cron = JSON.parse(await fs.readFile(path.join(cronDir, cronFiles[0]), 'utf-8'))
      expect(cron.name).toBe('Weekly Competitive Update')
      expect(cron.cronExpression).toBe('0 9 * * 1')
      expect(cron.targetType).toBe('team')
      expect(cron.enabled).toBe(false)

      // Verify targetId matches the team
      const teamsDir = path.join(state.tmpDir, 'projects', project.id, 'teams')
      const teamFiles = await fs.readdir(teamsDir)
      const team = JSON.parse(await fs.readFile(path.join(teamsDir, teamFiles[0]), 'utf-8'))
      expect(cron.targetId).toBe(team.id)
    })

    it('sets defaultTargetId to the research team', async () => {
      const project = await instantiateProjectTemplate('deep-research', 'Test', defaultModel)

      const teamsDir = path.join(state.tmpDir, 'projects', project.id, 'teams')
      const teamFiles = await fs.readdir(teamsDir)
      const team = JSON.parse(await fs.readFile(path.join(teamsDir, teamFiles[0]), 'utf-8'))

      expect(project.defaultTargetType).toBe('team')
      expect(project.defaultTargetId).toBe(team.id)
    })
  })

  describe('error cases', () => {
    it('throws for non-existent template', async () => {
      await expect(
        instantiateProjectTemplate('non-existent', 'Test', { provider: 'anthropic', model: 'claude-sonnet-4-20250514' })
      ).rejects.toThrow('Template "non-existent" not found')
    })
  })
})
