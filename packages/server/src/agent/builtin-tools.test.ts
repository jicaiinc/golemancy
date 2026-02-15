import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('bash-tool', () => ({
  createBashTool: vi.fn(),
}))

vi.mock('just-bash', () => ({
  Bash: vi.fn(),
  MountableFs: vi.fn(),
  InMemoryFs: vi.fn(),
  OverlayFs: vi.fn(),
  ReadWriteFs: vi.fn(),
}))

vi.mock('@golemancy/tools/browser', () => ({
  createBrowserTools: vi.fn(),
}))

vi.mock('../utils/paths', () => ({
  getProjectPath: vi.fn((id: string) => `/mock-data/projects/${id}`),
}))

vi.mock('node:fs/promises', () => ({
  default: { mkdir: vi.fn().mockResolvedValue(undefined) },
}))

vi.mock('./sandbox-pool', () => ({
  sandboxPool: {
    getHandle: vi.fn().mockRejectedValue(new Error('sandbox runtime not available')),
  },
}))

vi.mock('./resolve-permissions', () => ({
  resolvePermissionsConfig: vi.fn().mockResolvedValue(null),
}))

import { loadBuiltinTools, BUILTIN_TOOL_REGISTRY } from './builtin-tools'
import { resolvePermissionsConfig } from './resolve-permissions'
import { createBashTool } from 'bash-tool'
import { Bash, MountableFs, InMemoryFs, OverlayFs, ReadWriteFs } from 'just-bash'
import nodeFs from 'node:fs/promises'
import type { IPermissionsConfigService, PermissionsConfigId } from '@golemancy/shared'

const mockCreateBashTool = vi.mocked(createBashTool)

describe('BUILTIN_TOOL_REGISTRY', () => {
  it('has bash as available and enabled by default', () => {
    const bash = BUILTIN_TOOL_REGISTRY.find(t => t.id === 'bash')
    expect(bash).toBeDefined()
    expect(bash!.available).toBe(true)
    expect(bash!.defaultEnabled).toBe(true)
  })

  it('has browser as available but not enabled by default', () => {
    const browser = BUILTIN_TOOL_REGISTRY.find(t => t.id === 'browser')
    expect(browser).toBeDefined()
    expect(browser!.available).toBe(true)
    expect(browser!.defaultEnabled).toBe(false)
  })

  it('has os_control as not available', () => {
    const osCtrl = BUILTIN_TOOL_REGISTRY.find(t => t.id === 'os_control')
    expect(osCtrl).toBeDefined()
    expect(osCtrl!.available).toBe(false)
    expect(osCtrl!.defaultEnabled).toBe(false)
  })
})

describe('loadBuiltinTools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates MountableFs sandbox with projectId', async () => {
    const fakeTool = { execute: vi.fn() }
    mockCreateBashTool.mockResolvedValue({ tools: { bash: fakeTool } } as any)

    const result = await loadBuiltinTools({ bash: true }, { projectId: 'proj-1' })

    expect(result).not.toBeNull()
    expect(result!.tools).toHaveProperty('bash')

    // Creates workspace directory on disk
    expect(nodeFs.mkdir).toHaveBeenCalledWith('/mock-data/projects/proj-1/workspace', { recursive: true })

    // OverlayFs: project directory mounted read-only with mountPoint '/'
    expect(OverlayFs).toHaveBeenCalledWith({ root: '/mock-data/projects/proj-1', mountPoint: '/' })

    // ReadWriteFs: workspace directory for read-write
    expect(ReadWriteFs).toHaveBeenCalledWith({ root: '/mock-data/projects/proj-1/workspace' })

    // MountableFs: InMemoryFs base + two mounts
    expect(InMemoryFs).toHaveBeenCalled()
    expect(MountableFs).toHaveBeenCalledWith(expect.objectContaining({
      mounts: expect.arrayContaining([
        expect.objectContaining({ mountPoint: '/project' }),
        expect.objectContaining({ mountPoint: '/workspace' }),
      ]),
    }))

    // Bash: python + network + cwd at /workspace
    expect(Bash).toHaveBeenCalledWith(expect.objectContaining({
      python: true,
      network: { dangerouslyAllowFullInternetAccess: true },
      cwd: '/workspace',
    }))

    // createBashTool: destination at /workspace
    expect(mockCreateBashTool).toHaveBeenCalledWith(expect.objectContaining({
      destination: '/workspace',
    }))
  })

  it('falls back to default sandbox without projectId', async () => {
    const fakeTool = { execute: vi.fn() }
    mockCreateBashTool.mockResolvedValue({ tools: { bash: fakeTool } } as any)

    const result = await loadBuiltinTools({ bash: true })

    expect(result).not.toBeNull()
    expect(Bash).not.toHaveBeenCalled()
    expect(MountableFs).not.toHaveBeenCalled()
    expect(mockCreateBashTool).toHaveBeenCalledWith({
      sandbox: undefined,
      destination: undefined,
    })
  })

  it('returns null when bash is disabled', async () => {
    const result = await loadBuiltinTools({ bash: false })

    expect(result).toBeNull()
    expect(mockCreateBashTool).not.toHaveBeenCalled()
  })

  it('treats empty config as bash enabled (bash !== false)', async () => {
    const fakeTool = { execute: vi.fn() }
    mockCreateBashTool.mockResolvedValue({ tools: { bash: fakeTool } } as any)

    const result = await loadBuiltinTools({})

    expect(result).not.toBeNull()
    expect(mockCreateBashTool).toHaveBeenCalled()
  })

  it('handles createBashTool failure gracefully', async () => {
    mockCreateBashTool.mockRejectedValue(new Error('spawn failed'))

    const result = await loadBuiltinTools({ bash: true })

    expect(result).toBeNull()
  })

  it('returns a cleanup function', async () => {
    const fakeTool = { execute: vi.fn() }
    mockCreateBashTool.mockResolvedValue({ tools: { bash: fakeTool } } as any)

    const result = await loadBuiltinTools({ bash: true })

    expect(result).not.toBeNull()
    expect(typeof result!.cleanup).toBe('function')
    await expect(result!.cleanup()).resolves.toBeUndefined()
  })

  it('falls back to restricted mode when sandbox runtime is unavailable', async () => {
    const fakeTool = { execute: vi.fn() }
    mockCreateBashTool.mockResolvedValue({ tools: { bash: fakeTool } } as any)

    // Mock resolvePermissionsConfig to return sandbox mode
    vi.mocked(resolvePermissionsConfig).mockResolvedValueOnce({
      mode: 'sandbox',
      config: {
        allowWrite: ['/mock-data/projects/proj-1/workspace'],
        denyRead: [],
        denyWrite: [],
        networkRestrictionsEnabled: false,
        allowedDomains: [],
        deniedDomains: [],
        deniedCommands: [],
        applyToMCP: false,
      },
    })

    const mockPermsStorage: IPermissionsConfigService = {
      list: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      duplicate: vi.fn(),
    }

    const result = await loadBuiltinTools(
      { bash: true },
      {
        projectId: 'proj-1',
        permissionsConfigId: 'cfg-1' as PermissionsConfigId,
        permissionsConfigStorage: mockPermsStorage,
      },
    )

    // Should succeed via fallback, not fail
    expect(result).not.toBeNull()
    expect(result!.tools).toHaveProperty('bash')

    // Falls back to restricted mode (MountableFs-based sandbox)
    expect(MountableFs).toHaveBeenCalled()
    expect(Bash).toHaveBeenCalledWith(expect.objectContaining({
      cwd: '/workspace',
    }))
  })
})
