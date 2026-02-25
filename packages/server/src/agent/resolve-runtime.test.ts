import { describe, it, expect } from 'vitest'
import { resolveAgentRuntime } from './resolve-runtime'
import type { GlobalSettings, ProjectConfig } from '@golemancy/shared'

describe('resolveAgentRuntime', () => {
  const baseSettings: GlobalSettings = {
    providers: {},
    theme: 'dark',
  }

  it('returns "standard" by default when neither project nor global is set', () => {
    expect(resolveAgentRuntime(baseSettings)).toBe('standard')
    expect(resolveAgentRuntime(baseSettings, undefined)).toBe('standard')
    expect(resolveAgentRuntime(baseSettings, {})).toBe('standard')
  })

  it('returns global setting when project config has no agentRuntime', () => {
    const settings: GlobalSettings = { ...baseSettings, agentRuntime: 'claude-code' }
    expect(resolveAgentRuntime(settings)).toBe('claude-code')
    expect(resolveAgentRuntime(settings, {})).toBe('claude-code')
  })

  it('returns project config when both project and global are set (project wins)', () => {
    const settings: GlobalSettings = { ...baseSettings, agentRuntime: 'standard' }
    const projectConfig: ProjectConfig = { agentRuntime: 'claude-code' }
    expect(resolveAgentRuntime(settings, projectConfig)).toBe('claude-code')
  })

  it('returns project config "standard" over global "claude-code"', () => {
    const settings: GlobalSettings = { ...baseSettings, agentRuntime: 'claude-code' }
    const projectConfig: ProjectConfig = { agentRuntime: 'standard' }
    expect(resolveAgentRuntime(settings, projectConfig)).toBe('standard')
  })
})
