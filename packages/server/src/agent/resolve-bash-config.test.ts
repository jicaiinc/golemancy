import { describe, it, expect } from 'vitest'
import { PRESET_BALANCED, PRESET_STRICT, PRESET_PERMISSIVE } from '@golemancy/shared'
import type {
  GlobalBashToolConfig,
  ProjectBashToolConfig,
  SandboxConfig,
} from '@golemancy/shared'
import {
  resolveBashConfig,
  resolveMCPSafetyConfig,
  withGlobalDefaults,
  DEFAULT_GLOBAL_BASH_CONFIG,
  DEFAULT_PROJECT_BASH_CONFIG,
} from './resolve-bash-config'

// ── Test Helpers ─────────────────────────────────────────────

const BALANCED_GLOBAL: GlobalBashToolConfig = {
  defaultMode: 'sandbox',
  sandboxPreset: 'balanced',
}

const STRICT_GLOBAL: GlobalBashToolConfig = {
  defaultMode: 'sandbox',
  sandboxPreset: 'strict',
}

// ── Tests ────────────────────────────────────────────────────

describe('resolveBashConfig', () => {
  // ── Defaults ──────────────────────────────────────────────

  describe('defaults', () => {
    it('uses DEFAULT_GLOBAL_BASH_CONFIG when globalConfig is undefined', () => {
      const result = resolveBashConfig(undefined)
      expect(result.mode).toBe('restricted')
      expect(result.usesDedicatedWorker).toBe(false)
    })

    it('DEFAULT_GLOBAL_BASH_CONFIG is restricted + balanced', () => {
      expect(DEFAULT_GLOBAL_BASH_CONFIG.defaultMode).toBe('restricted')
      expect(DEFAULT_GLOBAL_BASH_CONFIG.sandboxPreset).toBe('balanced')
    })

    it('DEFAULT_PROJECT_BASH_CONFIG is inherit: true', () => {
      expect(DEFAULT_PROJECT_BASH_CONFIG.inherit).toBe(true)
    })
  })

  // ── Inheritance (project inherit=true or no config) ──────

  describe('inheritance', () => {
    it('uses global config when project config is undefined', () => {
      const result = resolveBashConfig(BALANCED_GLOBAL, undefined)
      expect(result.mode).toBe('sandbox')
      expect(result.sandbox).toMatchObject({
        enablePython: PRESET_BALANCED.enablePython,
      })
      expect(result.usesDedicatedWorker).toBe(false)
    })

    it('uses global config when project inherit=true', () => {
      const result = resolveBashConfig(BALANCED_GLOBAL, { inherit: true })
      expect(result.mode).toBe('sandbox')
      expect(result.usesDedicatedWorker).toBe(false)
    })

    it('inherits strict preset from global', () => {
      const result = resolveBashConfig(STRICT_GLOBAL)
      expect(result.mode).toBe('sandbox')
      // Strict preset has enablePython: false → python commands should be in deniedCommands
      expect(result.sandbox.enablePython).toBe(false)
      expect(result.sandbox.deniedCommands).toContain('python')
      expect(result.sandbox.deniedCommands).toContain('python3')
      expect(result.sandbox.deniedCommands).toContain('pip')
      expect(result.sandbox.deniedCommands).toContain('pip3')
    })

    it('uses global mode (restricted)', () => {
      const result = resolveBashConfig({
        defaultMode: 'restricted',
        sandboxPreset: 'balanced',
      })
      expect(result.mode).toBe('restricted')
    })

    it('uses global mode (unrestricted)', () => {
      const result = resolveBashConfig({
        defaultMode: 'unrestricted',
        sandboxPreset: 'balanced',
      })
      expect(result.mode).toBe('unrestricted')
    })
  })

  // ── Project custom config (inherit=false) ────────────────

  describe('project custom config', () => {
    it('project mode overrides global mode', () => {
      const result = resolveBashConfig(BALANCED_GLOBAL, {
        inherit: false,
        mode: 'restricted',
      })
      expect(result.mode).toBe('restricted')
    })

    it('project mode defaults to global mode when not set', () => {
      const result = resolveBashConfig(BALANCED_GLOBAL, {
        inherit: false,
      })
      expect(result.mode).toBe('sandbox')
    })

    it('usesDedicatedWorker is true when inherit=false and mode=sandbox', () => {
      const result = resolveBashConfig(BALANCED_GLOBAL, {
        inherit: false,
        mode: 'sandbox',
      })
      expect(result.usesDedicatedWorker).toBe(true)
    })

    it('usesDedicatedWorker is false when inherit=false and mode=restricted', () => {
      const result = resolveBashConfig(BALANCED_GLOBAL, {
        inherit: false,
        mode: 'restricted',
      })
      expect(result.usesDedicatedWorker).toBe(false)
    })

    it('usesDedicatedWorker is false when inherit=false and mode=unrestricted', () => {
      const result = resolveBashConfig(BALANCED_GLOBAL, {
        inherit: false,
        mode: 'unrestricted',
      })
      expect(result.usesDedicatedWorker).toBe(false)
    })
  })

  // ── Merge strategy ────────────────────────────────────────

  describe('merge strategy', () => {
    it('denyRead is UNION (additive) — project cannot remove global denies', () => {
      const result = resolveBashConfig(BALANCED_GLOBAL, {
        inherit: false,
        customConfig: {
          filesystem: {
            denyRead: ['**/custom-secret/**'],
          } as any,
        },
      })
      // Should contain both global denyRead and project denyRead
      expect(result.sandbox.filesystem.denyRead).toContain('~/.ssh')
      expect(result.sandbox.filesystem.denyRead).toContain('**/custom-secret/**')
    })

    it('denyWrite is UNION (additive)', () => {
      const result = resolveBashConfig(BALANCED_GLOBAL, {
        inherit: false,
        customConfig: {
          filesystem: {
            denyWrite: ['**/dist/**'],
          } as any,
        },
      })
      expect(result.sandbox.filesystem.denyWrite).toContain('**/.git/hooks/**')
      expect(result.sandbox.filesystem.denyWrite).toContain('**/dist/**')
    })

    it('deniedCommands is UNION (additive) — project cannot remove global bans', () => {
      const result = resolveBashConfig(BALANCED_GLOBAL, {
        inherit: false,
        customConfig: {
          deniedCommands: ['docker rm *'],
        },
      })
      // Should contain both global and project denied commands
      expect(result.sandbox.deniedCommands).toContain('sudo *')
      expect(result.sandbox.deniedCommands).toContain('docker rm *')
    })

    it('allowWrite is REPLACED by project (not merged)', () => {
      const result = resolveBashConfig(BALANCED_GLOBAL, {
        inherit: false,
        customConfig: {
          filesystem: {
            allowWrite: ['/workspace', '/tmp', '~/custom'],
          } as any,
        },
      })
      // Should be project's allowWrite, not union with global
      expect(result.sandbox.filesystem.allowWrite).toEqual(['/workspace', '/tmp', '~/custom'])
      // Should NOT contain global-only entries like ~/.npm
      expect(result.sandbox.filesystem.allowWrite).not.toContain('~/.npm')
    })

    it('allowedDomains is REPLACED by project', () => {
      const result = resolveBashConfig(BALANCED_GLOBAL, {
        inherit: false,
        customConfig: {
          network: {
            allowedDomains: ['internal.company.com'],
          },
        },
      })
      expect(result.sandbox.network.allowedDomains).toEqual(['internal.company.com'])
    })

    it('enablePython can only be disabled by project (AND logic)', () => {
      // Global: enablePython=true, Project: enablePython=false → false
      const result = resolveBashConfig(BALANCED_GLOBAL, {
        inherit: false,
        customConfig: { enablePython: false },
      })
      expect(result.sandbox.enablePython).toBe(false)
    })

    it('project cannot re-enable python when global disables it', () => {
      // Global: strict (enablePython=false), Project: enablePython=true → false
      const result = resolveBashConfig(STRICT_GLOBAL, {
        inherit: false,
        customConfig: { enablePython: true },
      })
      expect(result.sandbox.enablePython).toBe(false)
    })

    it('allowGitConfig can only be disabled by project (AND logic)', () => {
      // Global balanced has allowGitConfig=true
      const result = resolveBashConfig(BALANCED_GLOBAL, {
        inherit: false,
        customConfig: {
          filesystem: { allowGitConfig: false } as any,
        },
      })
      expect(result.sandbox.filesystem.allowGitConfig).toBe(false)
    })

    it('project cannot re-enable allowGitConfig when global disables it', () => {
      // Strict preset has allowGitConfig=false
      const result = resolveBashConfig(STRICT_GLOBAL, {
        inherit: false,
        customConfig: {
          filesystem: { allowGitConfig: true } as any,
        },
      })
      expect(result.sandbox.filesystem.allowGitConfig).toBe(false)
    })

    it('deduplicates merged arrays', () => {
      const result = resolveBashConfig(BALANCED_GLOBAL, {
        inherit: false,
        customConfig: {
          deniedCommands: ['sudo *'], // already in balanced
        },
      })
      // 'sudo *' should appear only once
      const sudoCount = result.sandbox.deniedCommands.filter(c => c === 'sudo *').length
      expect(sudoCount).toBe(1)
    })
  })

  // ── enablePython mapping ──────────────────────────────────

  describe('enablePython → deniedCommands mapping', () => {
    it('adds python/python3/pip/pip3 to deniedCommands when enablePython=false', () => {
      const result = resolveBashConfig(STRICT_GLOBAL)
      expect(result.sandbox.deniedCommands).toContain('python')
      expect(result.sandbox.deniedCommands).toContain('python3')
      expect(result.sandbox.deniedCommands).toContain('pip')
      expect(result.sandbox.deniedCommands).toContain('pip3')
    })

    it('does NOT add python commands when enablePython=true', () => {
      const result = resolveBashConfig(BALANCED_GLOBAL)
      expect(result.sandbox.deniedCommands).not.toContain('python')
      expect(result.sandbox.deniedCommands).not.toContain('python3')
    })

    it('does not duplicate python in deniedCommands', () => {
      // If strict preset already had 'python' in deniedCommands + enablePython=false
      const result = resolveBashConfig(STRICT_GLOBAL)
      const pythonCount = result.sandbox.deniedCommands.filter(c => c === 'python').length
      expect(pythonCount).toBe(1)
    })
  })

  // ── Custom preset ─────────────────────────────────────────

  describe('custom preset', () => {
    it('custom preset uses balanced as base with overrides', () => {
      const result = resolveBashConfig({
        defaultMode: 'sandbox',
        sandboxPreset: 'custom',
        customConfig: {
          enablePython: false,
        },
      })
      // Should have balanced's filesystem config
      expect(result.sandbox.filesystem.allowWrite).toEqual(PRESET_BALANCED.filesystem.allowWrite)
      // But with custom enablePython
      expect(result.sandbox.enablePython).toBe(false)
    })

    it('custom preset with no customConfig uses balanced defaults', () => {
      const result = resolveBashConfig({
        defaultMode: 'sandbox',
        sandboxPreset: 'custom',
      })
      expect(result.sandbox.filesystem).toEqual(PRESET_BALANCED.filesystem)
    })
  })
})

// ── MCP Safety Resolution ──────────────────────────────────

describe('resolveMCPSafetyConfig', () => {
  it('defaults to runInSandbox=false when global is undefined', () => {
    const result = resolveMCPSafetyConfig(undefined)
    expect(result.runInSandbox).toBe(false)
  })

  it('uses global config when project is undefined', () => {
    const result = resolveMCPSafetyConfig({ runInSandbox: true })
    expect(result.runInSandbox).toBe(true)
  })

  it('uses global config when project inherit=true', () => {
    const result = resolveMCPSafetyConfig(
      { runInSandbox: true },
      { inherit: true },
    )
    expect(result.runInSandbox).toBe(true)
  })

  it('project overrides when inherit=false', () => {
    const result = resolveMCPSafetyConfig(
      { runInSandbox: false },
      { inherit: false, runInSandbox: true },
    )
    expect(result.runInSandbox).toBe(true)
  })

  it('falls back to global when project inherit=false but runInSandbox undefined', () => {
    const result = resolveMCPSafetyConfig(
      { runInSandbox: true },
      { inherit: false },
    )
    expect(result.runInSandbox).toBe(true)
  })
})

// ── withGlobalDefaults ─────────────────────────────────────

describe('withGlobalDefaults', () => {
  it('fills in all defaults for undefined config', () => {
    const result = withGlobalDefaults()
    expect(result).toEqual({
      defaultMode: 'restricted',
      sandboxPreset: 'balanced',
      customConfig: undefined,
    })
  })

  it('preserves provided values', () => {
    const result = withGlobalDefaults({
      defaultMode: 'restricted',
      sandboxPreset: 'strict',
    })
    expect(result.defaultMode).toBe('restricted')
    expect(result.sandboxPreset).toBe('strict')
  })

  it('fills in missing fields', () => {
    const result = withGlobalDefaults({ defaultMode: 'unrestricted' })
    expect(result.defaultMode).toBe('unrestricted')
    expect(result.sandboxPreset).toBe('balanced')
  })
})
