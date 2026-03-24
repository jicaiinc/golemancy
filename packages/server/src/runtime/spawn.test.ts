import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { toShellCommand, toWinSpawn, normalizeCwd } from './spawn'

// ── Helpers ───────────────────────────────────────────────

const originalPlatform = process.platform

function setPlatform(platform: string): void {
  Object.defineProperty(process, 'platform', { value: platform, writable: true, configurable: true })
}

// ── Tests ─────────────────────────────────────────────────

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true, configurable: true })
  delete process.env.COMSPEC
})

// ── toShellCommand ────────────────────────────────────────

describe('toShellCommand', () => {
  describe('on win32', () => {
    beforeEach(() => setPlatform('win32'))

    it('returns cmd.exe with /c and windowsVerbatimArguments', () => {
      delete process.env.COMSPEC
      const result = toShellCommand('echo hello')
      expect(result.shell).toBe('cmd.exe')
      expect(result.args).toEqual(['/c', 'echo hello'])
      expect(result.spawnOptions).toEqual({ windowsVerbatimArguments: true })
    })

    it('uses COMSPEC when set', () => {
      process.env.COMSPEC = 'C:\\Windows\\system32\\cmd.exe'
      const result = toShellCommand('dir')
      expect(result.shell).toBe('C:\\Windows\\system32\\cmd.exe')
    })

    it('falls back to cmd.exe when COMSPEC is unset', () => {
      delete process.env.COMSPEC
      const result = toShellCommand('dir')
      expect(result.shell).toBe('cmd.exe')
    })
  })

  describe('on darwin', () => {
    beforeEach(() => setPlatform('darwin'))

    it('returns bash with -c and empty spawnOptions', () => {
      const result = toShellCommand('ls -la')
      expect(result.shell).toBe('bash')
      expect(result.args).toEqual(['-c', 'ls -la'])
      expect(result.spawnOptions).toEqual({})
    })
  })

  describe('on linux', () => {
    beforeEach(() => setPlatform('linux'))

    it('returns bash with -c and empty spawnOptions', () => {
      const result = toShellCommand('cat /etc/hosts')
      expect(result.shell).toBe('bash')
      expect(result.args).toEqual(['-c', 'cat /etc/hosts'])
      expect(result.spawnOptions).toEqual({})
    })
  })
})

// ── toWinSpawn ────────────────────────────────────────────

describe('toWinSpawn', () => {
  describe('on win32', () => {
    beforeEach(() => setPlatform('win32'))

    it('wraps bare command through cmd.exe /c', () => {
      delete process.env.COMSPEC
      const result = toWinSpawn('npx', ['-y', 'open-websearch'])
      expect(result.command).toBe('cmd.exe')
      expect(result.args).toEqual(['/c', 'npx', '-y', 'open-websearch'])
    })

    it('wraps commands without extension (npm, corepack)', () => {
      delete process.env.COMSPEC
      const result = toWinSpawn('npm', ['install', 'express'])
      expect(result.command).toBe('cmd.exe')
      expect(result.args).toEqual(['/c', 'npm', 'install', 'express'])
    })

    it('does NOT wrap commands ending in .exe', () => {
      const result = toWinSpawn('uv.exe', ['run', 'server'])
      expect(result.command).toBe('uv.exe')
      expect(result.args).toEqual(['run', 'server'])
    })

    it('does NOT wrap commands ending in .EXE (case insensitive)', () => {
      const result = toWinSpawn('C:\\tools\\MyTool.EXE', ['--flag'])
      expect(result.command).toBe('C:\\tools\\MyTool.EXE')
      expect(result.args).toEqual(['--flag'])
    })

    it('wraps commands with empty args', () => {
      delete process.env.COMSPEC
      const result = toWinSpawn('npx', [])
      expect(result.command).toBe('cmd.exe')
      expect(result.args).toEqual(['/c', 'npx'])
    })

    it('uses COMSPEC when set', () => {
      process.env.COMSPEC = 'C:\\Windows\\system32\\cmd.exe'
      const result = toWinSpawn('npx', ['-y', 'server'])
      expect(result.command).toBe('C:\\Windows\\system32\\cmd.exe')
    })
  })

  describe('on darwin', () => {
    beforeEach(() => setPlatform('darwin'))

    it('returns command and args unchanged', () => {
      const result = toWinSpawn('npx', ['-y', 'open-websearch'])
      expect(result.command).toBe('npx')
      expect(result.args).toEqual(['-y', 'open-websearch'])
    })
  })

  describe('on linux', () => {
    beforeEach(() => setPlatform('linux'))

    it('returns command and args unchanged', () => {
      const result = toWinSpawn('npm', ['start'])
      expect(result.command).toBe('npm')
      expect(result.args).toEqual(['start'])
    })
  })
})

// ── normalizeCwd ──────────────────────────────────────────

describe('normalizeCwd', () => {
  describe('on win32', () => {
    beforeEach(() => setPlatform('win32'))

    it('converts forward slashes to backslashes', () => {
      expect(normalizeCwd('C:/Users/test/project')).toBe('C:\\Users\\test\\project')
    })

    it('handles mixed separators', () => {
      expect(normalizeCwd('C:\\Users/test\\project/src')).toBe('C:\\Users\\test\\project\\src')
    })

    it('leaves already-correct backslashes unchanged', () => {
      expect(normalizeCwd('C:\\Users\\test\\project')).toBe('C:\\Users\\test\\project')
    })
  })

  describe('on darwin', () => {
    beforeEach(() => setPlatform('darwin'))

    it('returns path unchanged', () => {
      expect(normalizeCwd('/Users/test/project')).toBe('/Users/test/project')
    })
  })

  describe('on linux', () => {
    beforeEach(() => setPlatform('linux'))

    it('returns path unchanged', () => {
      expect(normalizeCwd('/home/test/project')).toBe('/home/test/project')
    })
  })
})
