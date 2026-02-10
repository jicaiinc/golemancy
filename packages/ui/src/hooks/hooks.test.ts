import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useResolvedConfig } from './index'
import { useAppStore } from '../stores'
import type { GlobalSettings, ProjectConfig, AgentModelConfig } from '@solocraft/shared'

describe('useResolvedConfig', () => {
  const baseSettings: GlobalSettings = {
    providers: [
      { provider: 'openai', apiKey: 'sk-test', defaultModel: 'gpt-4o' },
      { provider: 'anthropic', apiKey: 'sk-ant', defaultModel: 'claude-sonnet-4-5-20250929' },
    ],
    defaultProvider: 'openai',
    theme: 'dark',
  }

  beforeEach(() => {
    useAppStore.setState({ settings: baseSettings })
  })

  it('returns null when settings not loaded', () => {
    useAppStore.setState({ settings: null })
    const { result } = renderHook(() => useResolvedConfig())
    expect(result.current).toBeNull()
  })

  it('returns global defaults when no overrides', () => {
    const { result } = renderHook(() => useResolvedConfig())
    expect(result.current).toEqual({
      provider: 'openai',
      model: 'gpt-4o',
      temperature: 0.7,
      maxTokens: undefined,
    })
  })

  it('applies project-level provider override', () => {
    const projectConfig: ProjectConfig = {
      maxConcurrentAgents: 5,
      providerOverride: { provider: 'anthropic', defaultModel: 'claude-sonnet-4-5-20250929' },
    }
    const { result } = renderHook(() => useResolvedConfig(projectConfig))
    expect(result.current).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250929',
      temperature: 0.7,
      maxTokens: undefined,
    })
  })

  it('applies agent-level model override', () => {
    const agentConfig: AgentModelConfig = {
      model: 'gpt-4-turbo',
      temperature: 0.3,
      maxTokens: 4096,
    }
    const { result } = renderHook(() => useResolvedConfig(undefined, agentConfig))
    expect(result.current).toEqual({
      provider: 'openai',
      model: 'gpt-4-turbo',
      temperature: 0.3,
      maxTokens: 4096,
    })
  })

  it('applies three-layer merge: agent > project > global', () => {
    const projectConfig: ProjectConfig = {
      maxConcurrentAgents: 5,
      providerOverride: { provider: 'anthropic', defaultModel: 'claude-sonnet-4-5-20250929' },
    }
    const agentConfig: AgentModelConfig = {
      model: 'claude-opus-4-6',
      temperature: 0.1,
    }
    const { result } = renderHook(() => useResolvedConfig(projectConfig, agentConfig))
    expect(result.current).toEqual({
      provider: 'anthropic',     // from project
      model: 'claude-opus-4-6', // from agent (overrides project)
      temperature: 0.1,           // from agent
      maxTokens: undefined,
    })
  })

  it('falls back to project model when agent has no model', () => {
    const projectConfig: ProjectConfig = {
      maxConcurrentAgents: 3,
      providerOverride: { provider: 'anthropic', defaultModel: 'claude-sonnet-4-5-20250929' },
    }
    const agentConfig: AgentModelConfig = {
      temperature: 0.5,
    }
    const { result } = renderHook(() => useResolvedConfig(projectConfig, agentConfig))
    expect(result.current!.model).toBe('claude-sonnet-4-5-20250929')
    expect(result.current!.temperature).toBe(0.5)
  })
})
