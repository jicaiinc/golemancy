import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { detectPlatform, usePermissionMode, usePermissionConfig } from './index'
import { useAppStore } from '../stores'
import { configureServices } from '../services/container'
import type { ProjectId, AgentId, PermissionsConfigId, Project } from '@golemancy/shared'

// ── detectPlatform ────────────────────────────────────────────

describe('detectPlatform', () => {
  const originalUserAgent = navigator.userAgent

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
    })
  })

  function setUserAgent(ua: string) {
    Object.defineProperty(navigator, 'userAgent', {
      value: ua,
      configurable: true,
    })
  }

  it('returns win32 when user agent contains "win"', () => {
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
    expect(detectPlatform()).toBe('win32')
  })

  it('returns linux when user agent contains "linux"', () => {
    setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36')
    expect(detectPlatform()).toBe('linux')
  })

  it('returns darwin as default (macOS user agent)', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36')
    expect(detectPlatform()).toBe('darwin')
  })

  it('returns darwin for unknown user agent', () => {
    setUserAgent('SomeCustomBrowser/1.0')
    expect(detectPlatform()).toBe('darwin')
  })

  it('is case insensitive (Windows in mixed case)', () => {
    setUserAgent('Mozilla/5.0 WINDOWS NT')
    expect(detectPlatform()).toBe('win32')
  })
})

// ── usePermissionMode ─────────────────────────────────────────

describe('usePermissionMode', () => {
  const mockGetById = vi.fn()

  const testProject: Project = {
    id: 'proj-perm1' as ProjectId,
    name: 'Test Project',
    description: 'A test project',
    icon: 'sword',
    config: { maxConcurrentAgents: 3 },
    agentCount: 1,
    activeAgentCount: 0,
    lastActivityAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  beforeEach(() => {
    mockGetById.mockReset()
    configureServices({
      projects: {} as any,
      agents: {} as any,
      conversations: {} as any,
      tasks: {} as any,
      workspace: {} as any,
      memory: {} as any,
      skills: {} as any,
      mcp: {} as any,
      settings: {} as any,
      cronJobs: {} as any,
      dashboard: {} as any,
      permissionsConfig: { getById: mockGetById } as any,
    })
  })

  it('returns undefined when no project is selected', () => {
    useAppStore.setState({ projects: [], currentProjectId: null })
    const { result } = renderHook(() => usePermissionMode())
    expect(result.current).toBeUndefined()
  })

  it('fetches mode from permissionsConfig service', async () => {
    mockGetById.mockResolvedValue({ mode: 'unrestricted' })
    useAppStore.setState({
      projects: [testProject],
      currentProjectId: testProject.id,
    })

    const { result } = renderHook(() => usePermissionMode())
    await waitFor(() => expect(result.current).toBe('unrestricted'))
    expect(mockGetById).toHaveBeenCalledWith(testProject.id, 'default')
  })

  it('uses project permissionsConfigId when present', async () => {
    const customConfigId = 'perm-custom1' as PermissionsConfigId
    const projectWithConfig: Project = {
      ...testProject,
      config: { ...testProject.config, permissionsConfigId: customConfigId },
    }
    mockGetById.mockResolvedValue({ mode: 'restricted' })
    useAppStore.setState({
      projects: [projectWithConfig],
      currentProjectId: projectWithConfig.id,
    })

    const { result } = renderHook(() => usePermissionMode())
    await waitFor(() => expect(result.current).toBe('restricted'))
    expect(mockGetById).toHaveBeenCalledWith(projectWithConfig.id, customConfigId)
  })

  it('falls back to sandbox when config returns null mode', async () => {
    mockGetById.mockResolvedValue({ mode: undefined })
    useAppStore.setState({
      projects: [testProject],
      currentProjectId: testProject.id,
    })

    const { result } = renderHook(() => usePermissionMode())
    await waitFor(() => expect(result.current).toBe('sandbox'))
  })

  it('falls back to sandbox on service error', async () => {
    mockGetById.mockRejectedValue(new Error('Network error'))
    useAppStore.setState({
      projects: [testProject],
      currentProjectId: testProject.id,
    })

    const { result } = renderHook(() => usePermissionMode())
    await waitFor(() => expect(result.current).toBe('sandbox'))
  })
})

// ── usePermissionConfig ───────────────────────────────────────

describe('usePermissionConfig', () => {
  const mockGetById = vi.fn()
  const savedUserAgent = navigator.userAgent

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: savedUserAgent,
      configurable: true,
    })
  })

  const testProject: Project = {
    id: 'proj-perm2' as ProjectId,
    name: 'Test Project 2',
    description: 'Another test project',
    icon: 'pickaxe',
    config: { maxConcurrentAgents: 5 },
    agentCount: 2,
    activeAgentCount: 1,
    lastActivityAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  beforeEach(() => {
    mockGetById.mockReset()
    configureServices({
      projects: {} as any,
      agents: {} as any,
      conversations: {} as any,
      tasks: {} as any,
      workspace: {} as any,
      memory: {} as any,
      skills: {} as any,
      mcp: {} as any,
      settings: {} as any,
      cronJobs: {} as any,
      dashboard: {} as any,
      permissionsConfig: { getById: mockGetById } as any,
    })
  })

  it('returns sandboxSupported=true on macOS platform', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      configurable: true,
    })
    useAppStore.setState({ projects: [], currentProjectId: null })
    const { result } = renderHook(() => usePermissionConfig())
    expect(result.current.sandboxSupported).toBe(true)
  })

  it('returns sandboxSupported=false on Windows platform', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      configurable: true,
    })
    useAppStore.setState({ projects: [], currentProjectId: null })
    const { result } = renderHook(() => usePermissionConfig())
    expect(result.current.sandboxSupported).toBe(false)
  })

  it('returns mode and applyToMCP from service', async () => {
    mockGetById.mockResolvedValue({
      mode: 'unrestricted',
      config: { applyToMCP: false },
    })
    useAppStore.setState({
      projects: [testProject],
      currentProjectId: testProject.id,
    })

    const { result } = renderHook(() => usePermissionConfig())
    await waitFor(() => expect(result.current.mode).toBe('unrestricted'))
    expect(result.current.applyToMCP).toBe(false)
  })

  it('defaults applyToMCP to true when not in config', async () => {
    mockGetById.mockResolvedValue({
      mode: 'sandbox',
      config: {},
    })
    useAppStore.setState({
      projects: [testProject],
      currentProjectId: testProject.id,
    })

    const { result } = renderHook(() => usePermissionConfig())
    await waitFor(() => expect(result.current.mode).toBe('sandbox'))
    expect(result.current.applyToMCP).toBe(true)
  })

  it('falls back to sandbox + applyToMCP=true on error', async () => {
    mockGetById.mockRejectedValue(new Error('Service down'))
    useAppStore.setState({
      projects: [testProject],
      currentProjectId: testProject.id,
    })

    const { result } = renderHook(() => usePermissionConfig())
    await waitFor(() => expect(result.current.mode).toBe('sandbox'))
    expect(result.current.applyToMCP).toBe(true)
  })

  it('returns undefined mode when no project selected', () => {
    useAppStore.setState({ projects: [], currentProjectId: null })
    const { result } = renderHook(() => usePermissionConfig())
    expect(result.current.mode).toBeUndefined()
    expect(result.current.applyToMCP).toBe(true) // default
  })
})
