import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('bash-tool', () => ({
  createBashTool: vi.fn(),
}))

vi.mock('just-bash', () => ({
  Bash: vi.fn(),
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

import { loadBuiltinTools, BUILTIN_TOOL_REGISTRY } from './builtin-tools'
import { createBashTool } from 'bash-tool'
import { Bash, ReadWriteFs } from 'just-bash'

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

  it('returns tools when bash is enabled with projectId', async () => {
    const fakeTool = { execute: vi.fn() }
    mockCreateBashTool.mockResolvedValue({ tools: { bash: fakeTool } } as any)

    const result = await loadBuiltinTools({ bash: true }, { projectId: 'proj-1' })

    expect(result).not.toBeNull()
    expect(result!.tools).toHaveProperty('bash')
    // Should create ReadWriteFs-backed Bash and pass as sandbox
    expect(ReadWriteFs).toHaveBeenCalledWith({ root: '/mock-data/projects/proj-1/workspace' })
    expect(Bash).toHaveBeenCalledWith(expect.objectContaining({
      python: true,
      network: { dangerouslyAllowFullInternetAccess: true },
      cwd: '/',
    }))
    expect(mockCreateBashTool).toHaveBeenCalledWith(expect.objectContaining({
      destination: '/',
    }))
  })

  it('falls back to default sandbox without projectId', async () => {
    const fakeTool = { execute: vi.fn() }
    mockCreateBashTool.mockResolvedValue({ tools: { bash: fakeTool } } as any)

    const result = await loadBuiltinTools({ bash: true })

    expect(result).not.toBeNull()
    expect(Bash).not.toHaveBeenCalled()
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

    // Should return null since no tools were loaded, not throw
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
})
