import { describe, it, expect } from 'vitest'
import { PROJECT_TEMPLATES, getProjectTemplate } from '@golemancy/shared'

describe('PROJECT_TEMPLATES', () => {
  it('all template IDs are unique', () => {
    const ids = PROJECT_TEMPLATES.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all refIds within each template are unique', () => {
    for (const template of PROJECT_TEMPLATES) {
      const allRefIds = [
        ...template.skills.map(s => s.refId),
        ...template.agents.map(a => a.refId),
        ...template.teams.map(t => t.refId),
        ...template.mcpServers.map(m => m.refId),
        ...template.cronJobs.map(c => c.refId),
      ]
      expect(new Set(allRefIds).size, `Duplicate refIds in template "${template.id}"`).toBe(allRefIds.length)
    }
  })

  it('agent skillRefs resolve to existing skills', () => {
    for (const template of PROJECT_TEMPLATES) {
      const skillRefIds = new Set(template.skills.map(s => s.refId))
      for (const agent of template.agents) {
        for (const ref of agent.skillRefs ?? []) {
          expect(skillRefIds.has(ref), `Agent "${agent.refId}" refs skill "${ref}" not in template "${template.id}"`).toBe(true)
        }
      }
    }
  })

  it('agent mcpRefs resolve to existing mcpServers', () => {
    for (const template of PROJECT_TEMPLATES) {
      const mcpRefIds = new Set(template.mcpServers.map(m => m.refId))
      for (const agent of template.agents) {
        for (const ref of agent.mcpRefs ?? []) {
          expect(mcpRefIds.has(ref), `Agent "${agent.refId}" refs MCP "${ref}" not in template "${template.id}"`).toBe(true)
        }
      }
    }
  })

  it('team member agentRefs resolve to existing agents', () => {
    for (const template of PROJECT_TEMPLATES) {
      const agentRefIds = new Set(template.agents.map(a => a.refId))
      for (const team of template.teams) {
        for (const member of team.members) {
          expect(agentRefIds.has(member.agentRef), `Team "${team.refId}" refs agent "${member.agentRef}" not in template "${template.id}"`).toBe(true)
          if (member.parentAgentRef) {
            expect(agentRefIds.has(member.parentAgentRef), `Team "${team.refId}" refs parent "${member.parentAgentRef}" not in template "${template.id}"`).toBe(true)
          }
        }
      }
    }
  })

  it('cronJob targetRefs resolve to agents or teams', () => {
    for (const template of PROJECT_TEMPLATES) {
      const agentRefIds = new Set(template.agents.map(a => a.refId))
      const teamRefIds = new Set(template.teams.map(t => t.refId))
      for (const cron of template.cronJobs) {
        if (cron.targetType === 'agent') {
          expect(agentRefIds.has(cron.targetRef), `CronJob "${cron.refId}" targets agent "${cron.targetRef}" not in template "${template.id}"`).toBe(true)
        } else {
          expect(teamRefIds.has(cron.targetRef), `CronJob "${cron.refId}" targets team "${cron.targetRef}" not in template "${template.id}"`).toBe(true)
        }
      }
    }
  })

  it('defaultTarget ref resolves to valid agent or team', () => {
    for (const template of PROJECT_TEMPLATES) {
      const { type, ref } = template.defaultTarget
      if (type === 'agent') {
        const agentRefIds = new Set(template.agents.map(a => a.refId))
        expect(agentRefIds.has(ref), `defaultTarget refs agent "${ref}" not in template "${template.id}"`).toBe(true)
      } else {
        const teamRefIds = new Set(template.teams.map(t => t.refId))
        expect(teamRefIds.has(ref), `defaultTarget refs team "${ref}" not in template "${template.id}"`).toBe(true)
      }
    }
  })

  it('all templates have required fields', () => {
    for (const template of PROJECT_TEMPLATES) {
      expect(template.id).toBeTruthy()
      expect(template.name).toBeTruthy()
      expect(template.description).toBeTruthy()
      expect(template.category).toBeTruthy()
      expect(template.icon).toBeTruthy()
      expect(template.agents.length).toBeGreaterThan(0)
      expect(template.defaultTarget).toBeDefined()
    }
  })
})

describe('getProjectTemplate', () => {
  it('returns correct template by ID', () => {
    const wa = getProjectTemplate('writing-assistant')
    expect(wa).toBeDefined()
    expect(wa!.id).toBe('writing-assistant')
    expect(wa!.name).toBe('Writing Assistant')

    const dr = getProjectTemplate('deep-research')
    expect(dr).toBeDefined()
    expect(dr!.id).toBe('deep-research')
    expect(dr!.name).toBe('Deep Research')
  })

  it('returns undefined for non-existent template', () => {
    expect(getProjectTemplate('does-not-exist')).toBeUndefined()
    expect(getProjectTemplate('')).toBeUndefined()
  })
})
