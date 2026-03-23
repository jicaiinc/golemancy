import { describe, it, expect } from 'vitest'
import { buildBashInstructions } from './bash-tools'
import type { BashRuntimeInfo } from './bash-tools'

const BUNDLED: BashRuntimeInfo = { hasBundledPython: true, hasBundledNode: true }
const NO_BUNDLED: BashRuntimeInfo = { hasBundledPython: false, hasBundledNode: false }

describe('buildBashInstructions', () => {
  // ── Restricted mode ─────────────────────────────────────

  describe('restricted mode', () => {
    it('includes virtual filesystem layout when hasProject', () => {
      const result = buildBashInstructions('restricted', true)
      expect(result).toContain('**restricted**')
      expect(result).toContain('/workspace')
      expect(result).toContain('/project')
    })

    it('omits filesystem layout without project', () => {
      const result = buildBashInstructions('restricted', false)
      expect(result).toContain('**restricted**')
      expect(result).not.toContain('/workspace')
    })
  })

  // ── Sandbox mode ────────────────────────────────────────

  describe('sandbox mode', () => {
    it('outputs OS-level isolation text on supported platforms', () => {
      const result = buildBashInstructions('sandbox', true, 'darwin')
      expect(result).toContain('OS-level isolation')
      expect(result).not.toContain('application-level guardrails')
    })

    it('outputs application-level guardrails on unsupported platforms', () => {
      const result = buildBashInstructions('sandbox', true, 'win32')
      expect(result).toContain('application-level guardrails')
      expect(result).not.toContain('OS-level isolation')
    })

    it('includes Windows shell guidance on win32', () => {
      const result = buildBashInstructions('sandbox', true, 'win32')
      expect(result).toContain('cmd.exe')
      expect(result).toContain('dir')
      expect(result).toContain('type')
      expect(result).toContain('Windows environment')
    })

    it('omits Windows guidance on darwin', () => {
      const result = buildBashInstructions('sandbox', true, 'darwin')
      expect(result).not.toContain('cmd.exe')
      expect(result).not.toContain('Windows environment')
    })

    it('outputs guardrails text without platform param', () => {
      // No platform → falls through to OS-level isolation (original behavior)
      const result = buildBashInstructions('sandbox', true)
      expect(result).toContain('OS-level isolation')
    })

    it('says Python is available when bundled', () => {
      const result = buildBashInstructions('sandbox', true, 'darwin', BUNDLED)
      expect(result).toContain('Python is available with pip pre-installed')
      expect(result).toContain('pip install')
      expect(result).not.toContain('may be available')
    })

    it('says Python may be available when not bundled', () => {
      const result = buildBashInstructions('sandbox', true, 'darwin', NO_BUNDLED)
      expect(result).toContain('may be available')
      expect(result).not.toContain('pip pre-installed')
    })

    it('mentions Node.js when bundled', () => {
      const result = buildBashInstructions('sandbox', true, 'darwin', BUNDLED)
      expect(result).toContain('Node.js is available with npm pre-installed')
    })

    it('omits Node.js when not bundled', () => {
      const result = buildBashInstructions('sandbox', true, 'darwin', NO_BUNDLED)
      expect(result).not.toContain('Node.js')
    })
  })

  // ── Unrestricted mode ───────────────────────────────────

  describe('unrestricted mode', () => {
    it('includes full system access text', () => {
      const result = buildBashInstructions('unrestricted', true)
      expect(result).toContain('**unrestricted**')
      expect(result).toContain('full system access')
    })

    it('includes Windows shell guidance on win32', () => {
      const result = buildBashInstructions('unrestricted', true, 'win32')
      expect(result).toContain('cmd.exe')
      expect(result).toContain('Windows environment')
    })

    it('omits Windows guidance on darwin', () => {
      const result = buildBashInstructions('unrestricted', true, 'darwin')
      expect(result).not.toContain('cmd.exe')
    })

    it('says Python is available when bundled', () => {
      const result = buildBashInstructions('unrestricted', true, 'darwin', BUNDLED)
      expect(result).toContain('Python is available with pip pre-installed')
      expect(result).not.toContain('may be available')
    })

    it('says Python may be available when not bundled', () => {
      const result = buildBashInstructions('unrestricted', true, 'darwin', NO_BUNDLED)
      expect(result).toContain('may be available')
    })

    it('mentions Node.js when bundled', () => {
      const result = buildBashInstructions('unrestricted', true, 'darwin', BUNDLED)
      expect(result).toContain('Node.js is available with npm pre-installed')
    })
  })
})
