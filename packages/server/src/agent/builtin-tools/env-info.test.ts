import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildEnvironmentInstructions } from './env-info'

describe('buildEnvironmentInstructions', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows /workspace in restricted mode', () => {
    const result = buildEnvironmentInstructions({
      agentName: 'Test',
      workspaceDir: '/workspace',
      platform: 'darwin',
      permissionMode: 'restricted',
    })
    expect(result).toContain('- Workspace: /workspace')
    expect(result).toContain('confined to the sandbox')
  })

  it('shows host path in sandbox mode', () => {
    const result = buildEnvironmentInstructions({
      agentName: 'Test',
      workspaceDir: '/Users/x/.golemancy/projects/p1/workspace',
      platform: 'darwin',
      permissionMode: 'sandbox',
    })
    expect(result).toContain('- Workspace: /Users/x/.golemancy/projects/p1/workspace')
    expect(result).toContain('permissions config')
  })

  it('shows caution in unrestricted mode', () => {
    const result = buildEnvironmentInstructions({
      agentName: 'Test',
      workspaceDir: '/some/path',
      platform: 'linux',
      permissionMode: 'unrestricted',
    })
    expect(result).toContain('CAUTION')
    expect(result).toContain('unrestricted mode')
  })

  it('omits permission section when mode is undefined', () => {
    const result = buildEnvironmentInstructions({
      agentName: 'Test',
      platform: 'darwin',
    })
    expect(result).not.toContain('Permission mode')
    expect(result).not.toContain('Exercise caution')
    expect(result).not.toContain('sandbox')
  })

  it('displays model with provider', () => {
    const result = buildEnvironmentInstructions({
      agentName: 'Test',
      platform: 'darwin',
      model: 'gpt-4o',
      provider: 'openai',
    })
    expect(result).toContain('- Model: gpt-4o (openai)')
  })

  it('displays model without provider', () => {
    const result = buildEnvironmentInstructions({
      agentName: 'Test',
      platform: 'darwin',
      model: 'claude-sonnet-4-20250514',
    })
    expect(result).toContain('- Model: claude-sonnet-4-20250514')
    // Model line should NOT contain provider parens; timezone parens are OK
    expect(result).toMatch(/Model: claude-sonnet-4-20250514\n/)
  })

  it('omits model line when not provided', () => {
    const result = buildEnvironmentInstructions({
      agentName: 'Test',
      platform: 'darwin',
    })
    expect(result).not.toContain('Model:')
  })

  it('uses local date, not UTC', () => {
    // Mock Date to 2026-04-05 01:00 local (would be 2026-04-04 in UTC for UTC+8)
    const mockDate = new Date(2026, 3, 5, 1, 0, 0) // April 5, 2026 01:00 local
    vi.spyOn(global, 'Date').mockImplementation((...args: any[]) => {
      if (args.length === 0) return mockDate
      // @ts-expect-error — spread to Date constructor
      return new (Function.prototype.bind.apply(Date as any, [null, ...args]))()
    })

    const result = buildEnvironmentInstructions({
      agentName: 'Test',
      platform: 'darwin',
    })
    expect(result).toContain('- Date: 2026-04-05 01:00')
    expect(result).toMatch(/Date: .+\(.+\)/)  // timezone in parens
  })
})
