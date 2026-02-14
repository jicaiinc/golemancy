import { describe, it, expect } from 'vitest'
import {
  validateGlobalBashConfig,
  validateSandboxConfig,
  validateProjectBashConfig,
} from './validate-bash-config'

// ── Tests ────────────────────────────────────────────────────

describe('validateGlobalBashConfig', () => {
  // ── Valid configs ────────────────────────────────────────

  describe('valid configs', () => {
    it('accepts a minimal valid config', () => {
      const result = validateGlobalBashConfig({
        defaultMode: 'sandbox',
        sandboxPreset: 'balanced',
      })
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('accepts config with all valid modes', () => {
      for (const mode of ['restricted', 'sandbox', 'unrestricted']) {
        const result = validateGlobalBashConfig({ defaultMode: mode })
        expect(result.valid).toBe(true)
      }
    })

    it('accepts config with all valid presets', () => {
      for (const preset of ['balanced', 'strict', 'permissive', 'development', 'custom']) {
        const result = validateGlobalBashConfig({ sandboxPreset: preset })
        expect(result.valid).toBe(true)
      }
    })

    it('accepts config with customConfig', () => {
      const result = validateGlobalBashConfig({
        defaultMode: 'sandbox',
        sandboxPreset: 'custom',
        customConfig: {
          enablePython: false,
          deniedCommands: ['docker *'],
        },
      })
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('accepts empty object (all fields optional)', () => {
      const result = validateGlobalBashConfig({})
      expect(result.valid).toBe(true)
    })
  })

  // ── Invalid configs ──────────────────────────────────────

  describe('invalid configs', () => {
    it('rejects null', () => {
      const result = validateGlobalBashConfig(null)
      expect(result.valid).toBe(false)
      expect(result.errors[0].field).toBe('bashTool')
    })

    it('rejects undefined', () => {
      const result = validateGlobalBashConfig(undefined)
      expect(result.valid).toBe(false)
    })

    it('rejects non-object (string)', () => {
      const result = validateGlobalBashConfig('sandbox')
      expect(result.valid).toBe(false)
      expect(result.errors[0].message).toBe('Must be an object')
    })

    it('rejects non-object (number)', () => {
      const result = validateGlobalBashConfig(42)
      expect(result.valid).toBe(false)
    })

    it('rejects invalid defaultMode', () => {
      const result = validateGlobalBashConfig({ defaultMode: 'turbo' })
      expect(result.valid).toBe(false)
      expect(result.errors[0].field).toBe('defaultMode')
      expect(result.errors[0].message).toContain('restricted')
      expect(result.errors[0].message).toContain('sandbox')
      expect(result.errors[0].message).toContain('unrestricted')
    })

    it('rejects invalid sandboxPreset', () => {
      const result = validateGlobalBashConfig({ sandboxPreset: 'ultra' })
      expect(result.valid).toBe(false)
      expect(result.errors[0].field).toBe('sandboxPreset')
      expect(result.errors[0].message).toContain('balanced')
    })

    it('rejects invalid customConfig (non-object)', () => {
      const result = validateGlobalBashConfig({ customConfig: 'bad' })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field.includes('sandboxConfig'))).toBe(true)
    })

    it('collects multiple errors', () => {
      const result = validateGlobalBashConfig({
        defaultMode: 'invalid',
        sandboxPreset: 'invalid',
      })
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBe(2)
    })
  })
})

// ── validateSandboxConfig ─────────────────────────────────────

describe('validateSandboxConfig', () => {
  // ── Valid configs ────────────────────────────────────────

  describe('valid configs', () => {
    it('accepts a full valid config', () => {
      const errors = validateSandboxConfig({
        filesystem: {
          allowWrite: ['/workspace', '/tmp'],
          denyRead: ['~/.ssh'],
          denyWrite: ['**/.git/hooks/**'],
          allowGitConfig: true,
        },
        network: {
          allowedDomains: ['github.com'],
        },
        enablePython: true,
        deniedCommands: ['sudo *'],
      })
      expect(errors).toHaveLength(0)
    })

    it('accepts empty object (all fields optional)', () => {
      const errors = validateSandboxConfig({})
      expect(errors).toHaveLength(0)
    })

    it('accepts partial filesystem config', () => {
      const errors = validateSandboxConfig({
        filesystem: { allowWrite: ['/workspace'] },
      })
      expect(errors).toHaveLength(0)
    })

    it('accepts empty arrays', () => {
      const errors = validateSandboxConfig({
        filesystem: { allowWrite: [], denyRead: [], denyWrite: [] },
        network: { allowedDomains: [] },
        deniedCommands: [],
      })
      expect(errors).toHaveLength(0)
    })
  })

  // ── Invalid configs ──────────────────────────────────────

  describe('invalid configs', () => {
    it('rejects null', () => {
      const errors = validateSandboxConfig(null)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toBe('Must be an object')
    })

    it('rejects undefined', () => {
      const errors = validateSandboxConfig(undefined)
      expect(errors.length).toBeGreaterThan(0)
    })

    it('rejects filesystem as non-object', () => {
      const errors = validateSandboxConfig({ filesystem: 'bad' })
      expect(errors.some(e => e.field.includes('filesystem'))).toBe(true)
      expect(errors[0].message).toBe('Must be an object')
    })

    it('rejects filesystem as null', () => {
      const errors = validateSandboxConfig({ filesystem: null })
      expect(errors.some(e => e.field.includes('filesystem'))).toBe(true)
    })

    it('rejects allowWrite as non-array', () => {
      const errors = validateSandboxConfig({
        filesystem: { allowWrite: '/workspace' },
      })
      expect(errors.some(e => e.field.includes('allowWrite'))).toBe(true)
      expect(errors[0].message).toBe('Must be an array of strings')
    })

    it('rejects allowWrite with non-string elements', () => {
      const errors = validateSandboxConfig({
        filesystem: { allowWrite: ['/workspace', 123] },
      })
      expect(errors.some(e => e.field.includes('allowWrite'))).toBe(true)
    })

    it('rejects denyRead as non-array', () => {
      const errors = validateSandboxConfig({
        filesystem: { denyRead: { path: '~/.ssh' } },
      })
      expect(errors.some(e => e.field.includes('denyRead'))).toBe(true)
    })

    it('rejects denyWrite as non-array', () => {
      const errors = validateSandboxConfig({
        filesystem: { denyWrite: true },
      })
      expect(errors.some(e => e.field.includes('denyWrite'))).toBe(true)
    })

    it('rejects allowGitConfig as non-boolean', () => {
      const errors = validateSandboxConfig({
        filesystem: { allowGitConfig: 'yes' },
      })
      expect(errors.some(e => e.field.includes('allowGitConfig'))).toBe(true)
      expect(errors[0].message).toBe('Must be a boolean')
    })

    it('rejects network as non-object', () => {
      const errors = validateSandboxConfig({ network: 42 })
      expect(errors.some(e => e.field.includes('network'))).toBe(true)
    })

    it('rejects network as null', () => {
      const errors = validateSandboxConfig({ network: null })
      expect(errors.some(e => e.field.includes('network'))).toBe(true)
    })

    it('rejects allowedDomains as non-array', () => {
      const errors = validateSandboxConfig({
        network: { allowedDomains: 'github.com' },
      })
      expect(errors.some(e => e.field.includes('allowedDomains'))).toBe(true)
    })

    it('rejects allowedDomains with non-string elements', () => {
      const errors = validateSandboxConfig({
        network: { allowedDomains: ['github.com', 123] },
      })
      expect(errors.some(e => e.field.includes('allowedDomains'))).toBe(true)
    })

    it('rejects enablePython as non-boolean', () => {
      const errors = validateSandboxConfig({ enablePython: 'true' })
      expect(errors.some(e => e.field.includes('enablePython'))).toBe(true)
      expect(errors[0].message).toBe('Must be a boolean')
    })

    it('rejects deniedCommands as non-array', () => {
      const errors = validateSandboxConfig({ deniedCommands: 'sudo' })
      expect(errors.some(e => e.field.includes('deniedCommands'))).toBe(true)
    })

    it('rejects deniedCommands with non-string elements', () => {
      const errors = validateSandboxConfig({ deniedCommands: ['sudo', 42] })
      expect(errors.some(e => e.field.includes('deniedCommands'))).toBe(true)
    })

    it('collects multiple validation errors', () => {
      const errors = validateSandboxConfig({
        enablePython: 'yes',
        deniedCommands: 123,
        filesystem: { allowWrite: 'bad', denyRead: 99 },
      })
      expect(errors.length).toBeGreaterThanOrEqual(3)
    })
  })

  // ── Prefix support ───────────────────────────────────────

  describe('prefix support', () => {
    it('prepends prefix to field names', () => {
      const errors = validateSandboxConfig({ enablePython: 'bad' }, 'customConfig')
      expect(errors[0].field).toBe('customConfig.enablePython')
    })

    it('uses no prefix when empty string', () => {
      const errors = validateSandboxConfig({ enablePython: 42 }, '')
      expect(errors[0].field).toBe('enablePython')
    })

    it('uses no prefix by default', () => {
      const errors = validateSandboxConfig({ enablePython: 42 })
      expect(errors[0].field).toBe('enablePython')
    })

    it('prefixes nested filesystem fields', () => {
      const errors = validateSandboxConfig({
        filesystem: { allowWrite: 123 },
      }, 'project')
      expect(errors[0].field).toBe('project.filesystem.allowWrite')
    })

    it('prefixes nested network fields', () => {
      const errors = validateSandboxConfig({
        network: { allowedDomains: 'bad' },
      }, 'myPrefix')
      expect(errors[0].field).toBe('myPrefix.network.allowedDomains')
    })
  })
})

// ── validateProjectBashConfig ──────────────────────────────────

describe('validateProjectBashConfig', () => {
  // ── Valid configs ────────────────────────────────────────

  describe('valid configs', () => {
    it('accepts inherit=true', () => {
      const result = validateProjectBashConfig({ inherit: true })
      expect(result.valid).toBe(true)
    })

    it('accepts inherit=false with valid mode', () => {
      const result = validateProjectBashConfig({
        inherit: false,
        mode: 'sandbox',
      })
      expect(result.valid).toBe(true)
    })

    it('accepts inherit=false with customConfig', () => {
      const result = validateProjectBashConfig({
        inherit: false,
        customConfig: {
          enablePython: false,
          filesystem: {
            allowWrite: ['/workspace'],
          },
        },
      })
      expect(result.valid).toBe(true)
    })

    it('accepts empty object (all fields optional)', () => {
      const result = validateProjectBashConfig({})
      expect(result.valid).toBe(true)
    })

    it('accepts all valid mode values', () => {
      for (const mode of ['restricted', 'sandbox', 'unrestricted']) {
        const result = validateProjectBashConfig({ mode })
        expect(result.valid).toBe(true)
      }
    })
  })

  // ── Invalid configs ──────────────────────────────────────

  describe('invalid configs', () => {
    it('rejects null', () => {
      const result = validateProjectBashConfig(null)
      expect(result.valid).toBe(false)
      expect(result.errors[0].field).toBe('bashTool')
    })

    it('rejects undefined', () => {
      const result = validateProjectBashConfig(undefined)
      expect(result.valid).toBe(false)
    })

    it('rejects non-object', () => {
      const result = validateProjectBashConfig('inherit')
      expect(result.valid).toBe(false)
    })

    it('rejects invalid mode', () => {
      const result = validateProjectBashConfig({ mode: 'turbo' })
      expect(result.valid).toBe(false)
      expect(result.errors[0].field).toBe('mode')
    })

    it('rejects invalid inherit type', () => {
      const result = validateProjectBashConfig({ inherit: 'yes' })
      expect(result.valid).toBe(false)
      expect(result.errors[0].field).toBe('inherit')
      expect(result.errors[0].message).toBe('Must be a boolean')
    })
  })

  // ── customConfig validation ──────────────────────────────

  describe('customConfig validation', () => {
    it('validates customConfig only when inherit=false', () => {
      const result = validateProjectBashConfig({
        inherit: false,
        customConfig: { enablePython: 'bad' },
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field.includes('enablePython'))).toBe(true)
    })

    it('skips customConfig validation when inherit=true', () => {
      const result = validateProjectBashConfig({
        inherit: true,
        customConfig: { enablePython: 'bad' },
      })
      // customConfig is not validated when inherit=true
      expect(result.valid).toBe(true)
    })

    it('skips customConfig validation when inherit is undefined', () => {
      // inherit is undefined (not explicitly false), so customConfig is not validated
      const result = validateProjectBashConfig({
        customConfig: { enablePython: 'bad' },
      })
      expect(result.valid).toBe(true)
    })

    it('prefixes customConfig errors with "customConfig."', () => {
      const result = validateProjectBashConfig({
        inherit: false,
        customConfig: { deniedCommands: 123 },
      })
      expect(result.valid).toBe(false)
      expect(result.errors[0].field).toBe('customConfig.deniedCommands')
    })

    it('collects errors from both mode and customConfig', () => {
      const result = validateProjectBashConfig({
        inherit: false,
        mode: 'invalid',
        customConfig: { enablePython: 42 },
      })
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBe(2)
      expect(result.errors.some(e => e.field === 'mode')).toBe(true)
      expect(result.errors.some(e => e.field.includes('enablePython'))).toBe(true)
    })
  })
})
