import { describe, it, expect } from 'vitest'
import type { PermissionsConfig } from '@golemancy/shared'
import { permissionsToSandboxConfig } from './permissions-adapter'

// ── Test Helpers ─────────────────────────────────────────────

function makePermissionsConfig(overrides: Partial<PermissionsConfig> = {}): PermissionsConfig {
  return {
    allowWrite: ['/workspace', '/tmp'],
    denyRead: ['**/.env'],
    denyWrite: ['**/.git/**'],
    networkRestrictionsEnabled: false,
    allowedDomains: [],
    deniedDomains: [],
    deniedCommands: ['sudo'],
    applyToMCP: true,
    ...overrides,
  }
}

// ── Tests ────────────────────────────────────────────────────

describe('permissionsToSandboxConfig', () => {
  describe('filesystem mapping', () => {
    it('maps allowWrite from PermissionsConfig to SandboxConfig.filesystem.allowWrite', () => {
      const pc = makePermissionsConfig({ allowWrite: ['/workspace', '/tmp', '/data'] })
      const result = permissionsToSandboxConfig(pc)
      expect(result.filesystem.allowWrite).toEqual(['/workspace', '/tmp', '/data'])
    })

    it('maps denyRead from PermissionsConfig to SandboxConfig.filesystem.denyRead', () => {
      const pc = makePermissionsConfig({ denyRead: ['**/.env', '~/.ssh', '/etc/passwd'] })
      const result = permissionsToSandboxConfig(pc)
      expect(result.filesystem.denyRead).toEqual(['**/.env', '~/.ssh', '/etc/passwd'])
    })

    it('maps denyWrite from PermissionsConfig to SandboxConfig.filesystem.denyWrite', () => {
      const pc = makePermissionsConfig({ denyWrite: ['**/.git/**', '**/node_modules/**'] })
      const result = permissionsToSandboxConfig(pc)
      expect(result.filesystem.denyWrite).toEqual(['**/.git/**', '**/node_modules/**'])
    })
  })

  describe('allowGitConfig', () => {
    it('is always false regardless of input', () => {
      const result = permissionsToSandboxConfig(makePermissionsConfig())
      expect(result.filesystem.allowGitConfig).toBe(false)
    })

    it('is false even when all other fields are populated', () => {
      const pc = makePermissionsConfig({
        allowWrite: ['/workspace'],
        denyRead: ['**/.env'],
        denyWrite: ['**/.git/**'],
        networkRestrictionsEnabled: true,
        allowedDomains: ['example.com'],
        deniedCommands: ['sudo'],
      })
      const result = permissionsToSandboxConfig(pc)
      expect(result.filesystem.allowGitConfig).toBe(false)
    })
  })

  describe('network mapping', () => {
    it('passes allowedDomains through when networkRestrictionsEnabled=true', () => {
      const pc = makePermissionsConfig({
        networkRestrictionsEnabled: true,
        allowedDomains: ['api.github.com', 'npmjs.org'],
      })
      const result = permissionsToSandboxConfig(pc)
      expect(result.network.allowedDomains).toEqual(['api.github.com', 'npmjs.org'])
    })

    it('sets allowedDomains to undefined when networkRestrictionsEnabled=false', () => {
      const pc = makePermissionsConfig({
        networkRestrictionsEnabled: false,
        allowedDomains: ['api.github.com'],
      })
      const result = permissionsToSandboxConfig(pc)
      expect(result.network.allowedDomains).toBeUndefined()
    })

    it('sets allowedDomains to undefined when networkRestrictionsEnabled=false even with non-empty allowedDomains', () => {
      const pc = makePermissionsConfig({
        networkRestrictionsEnabled: false,
        allowedDomains: ['should.be.ignored.com', 'also.ignored.net'],
      })
      const result = permissionsToSandboxConfig(pc)
      expect(result.network.allowedDomains).toBeUndefined()
    })

    it('passes empty allowedDomains array through when networkRestrictionsEnabled=true', () => {
      const pc = makePermissionsConfig({
        networkRestrictionsEnabled: true,
        allowedDomains: [],
      })
      const result = permissionsToSandboxConfig(pc)
      expect(result.network.allowedDomains).toEqual([])
    })
  })

  describe('enablePython', () => {
    it('is always true regardless of input', () => {
      const result = permissionsToSandboxConfig(makePermissionsConfig())
      expect(result.enablePython).toBe(true)
    })

    it('is true even when config has restrictive settings', () => {
      const pc = makePermissionsConfig({
        allowWrite: [],
        denyRead: ['**/*'],
        denyWrite: ['**/*'],
        networkRestrictionsEnabled: true,
        allowedDomains: [],
        deniedCommands: ['python', 'python3'],
      })
      const result = permissionsToSandboxConfig(pc)
      expect(result.enablePython).toBe(true)
    })
  })

  describe('deniedCommands pass-through', () => {
    it('maps deniedCommands from PermissionsConfig to SandboxConfig.deniedCommands', () => {
      const pc = makePermissionsConfig({ deniedCommands: ['sudo', 'rm', 'chmod'] })
      const result = permissionsToSandboxConfig(pc)
      expect(result.deniedCommands).toEqual(['sudo', 'rm', 'chmod'])
    })

    it('preserves order of deniedCommands', () => {
      const commands = ['curl', 'wget', 'sudo', 'chmod', 'chown']
      const pc = makePermissionsConfig({ deniedCommands: commands })
      const result = permissionsToSandboxConfig(pc)
      expect(result.deniedCommands).toEqual(commands)
    })
  })

  describe('empty arrays', () => {
    it('maps empty allowWrite to empty array', () => {
      const pc = makePermissionsConfig({ allowWrite: [] })
      const result = permissionsToSandboxConfig(pc)
      expect(result.filesystem.allowWrite).toEqual([])
    })

    it('maps empty denyRead to empty array', () => {
      const pc = makePermissionsConfig({ denyRead: [] })
      const result = permissionsToSandboxConfig(pc)
      expect(result.filesystem.denyRead).toEqual([])
    })

    it('maps empty denyWrite to empty array', () => {
      const pc = makePermissionsConfig({ denyWrite: [] })
      const result = permissionsToSandboxConfig(pc)
      expect(result.filesystem.denyWrite).toEqual([])
    })

    it('maps empty deniedCommands to empty array', () => {
      const pc = makePermissionsConfig({ deniedCommands: [] })
      const result = permissionsToSandboxConfig(pc)
      expect(result.deniedCommands).toEqual([])
    })
  })

  describe('Windows-typical config', () => {
    it('maps a Windows-representative config correctly', () => {
      const pc: PermissionsConfig = {
        allowWrite: ['C:\\Users\\caiyo\\workspace', 'C:\\Users\\caiyo\\AppData\\Local\\golemancy'],
        denyRead: ['C:\\Windows\\System32\\**', 'C:\\Users\\caiyo\\.ssh\\**'],
        denyWrite: ['C:\\Windows\\**', 'C:\\Program Files\\**'],
        networkRestrictionsEnabled: false,
        allowedDomains: [],
        deniedDomains: [],
        deniedCommands: ['format', 'del', 'rd', 'rmdir', 'net', 'reg'],
        applyToMCP: false,
      }

      const result = permissionsToSandboxConfig(pc)

      expect(result.filesystem.allowWrite).toEqual([
        'C:\\Users\\caiyo\\workspace',
        'C:\\Users\\caiyo\\AppData\\Local\\golemancy',
      ])
      expect(result.filesystem.denyRead).toEqual([
        'C:\\Windows\\System32\\**',
        'C:\\Users\\caiyo\\.ssh\\**',
      ])
      expect(result.filesystem.denyWrite).toEqual([
        'C:\\Windows\\**',
        'C:\\Program Files\\**',
      ])
      expect(result.filesystem.allowGitConfig).toBe(false)
      expect(result.network.allowedDomains).toBeUndefined()
      expect(result.enablePython).toBe(true)
      expect(result.deniedCommands).toEqual(['format', 'del', 'rd', 'rmdir', 'net', 'reg'])
    })

    it('Windows config with network restrictions enabled passes allowedDomains through', () => {
      const pc: PermissionsConfig = {
        allowWrite: ['C:\\Users\\caiyo\\workspace'],
        denyRead: ['C:\\Windows\\System32\\**'],
        denyWrite: ['C:\\Windows\\**'],
        networkRestrictionsEnabled: true,
        allowedDomains: ['api.anthropic.com', 'npmjs.org'],
        deniedDomains: [],
        deniedCommands: ['format', 'del'],
        applyToMCP: false,
      }

      const result = permissionsToSandboxConfig(pc)

      expect(result.network.allowedDomains).toEqual(['api.anthropic.com', 'npmjs.org'])
    })
  })
})
