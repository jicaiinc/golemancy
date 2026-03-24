import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { toShellCommand, toWinSpawn, normalizeCwd, resolveWindowsCommand } from './spawn'

// ── Mock fs.existsSync ────────────────────────────────────

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return { ...actual, existsSync: vi.fn(() => false) }
})

import { existsSync } from 'node:fs'
const mockExistsSync = vi.mocked(existsSync)

// ── Platform helpers ──────────────────────────────────────

const originalPlatform = process.platform

function setPlatform(platform: string): void {
  Object.defineProperty(process, 'platform', { value: platform, writable: true, configurable: true })
}

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true, configurable: true })
  delete process.env.COMSPEC
  delete process.env.PATHEXT
  mockExistsSync.mockReset()
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

// ── resolveWindowsCommand ─────────────────────────────────

describe('resolveWindowsCommand', () => {
  describe('explicit extension', () => {
    it('returns cmd-wrap for .cmd', () => {
      expect(resolveWindowsCommand('npx.cmd')).toBe('cmd-wrap')
    })

    it('returns cmd-wrap for .bat', () => {
      expect(resolveWindowsCommand('build.bat')).toBe('cmd-wrap')
    })

    it('returns cmd-wrap for .CMD (case insensitive)', () => {
      expect(resolveWindowsCommand('NPX.CMD')).toBe('cmd-wrap')
    })

    it('returns direct for .exe', () => {
      expect(resolveWindowsCommand('node.exe')).toBe('direct')
    })

    it('returns direct for .EXE (case insensitive)', () => {
      expect(resolveWindowsCommand('NODE.EXE')).toBe('direct')
    })

    it('returns direct for .com', () => {
      expect(resolveWindowsCommand('tool.com')).toBe('direct')
    })
  })

  describe('path with separators', () => {
    it('returns direct when .exe variant exists', () => {
      mockExistsSync.mockImplementation((p) =>
        p.toString().endsWith('.exe'),
      )
      expect(resolveWindowsCommand('C:\\tools\\mytool')).toBe('direct')
    })

    it('returns cmd-wrap when only .cmd variant exists', () => {
      mockExistsSync.mockImplementation((p) =>
        p.toString().endsWith('.cmd'),
      )
      expect(resolveWindowsCommand('C:\\tools\\mytool')).toBe('cmd-wrap')
    })

    it('returns direct when file exists without extension', () => {
      mockExistsSync.mockImplementation((p) =>
        p.toString() === 'C:\\tools\\mytool',
      )
      expect(resolveWindowsCommand('C:\\tools\\mytool')).toBe('direct')
    })

    it('resolves relative path against provided cwd', () => {
      mockExistsSync.mockImplementation((p) => {
        const s = p.toString()
        // .exe exists at the transport cwd, not the server process cwd
        return s === 'C:\\project\\workspace\\bin\\tool.exe'
      })
      expect(resolveWindowsCommand('./bin/tool', undefined, 'C:\\project\\workspace')).toBe('direct')
    })

    it('resolves relative path as cmd-wrap when only .cmd at cwd', () => {
      mockExistsSync.mockImplementation((p) =>
        p.toString() === 'C:\\project\\workspace\\bin\\tool.cmd',
      )
      expect(resolveWindowsCommand('./bin/tool', undefined, 'C:\\project\\workspace')).toBe('cmd-wrap')
    })
  })

  describe('bare command — PATH + PATHEXT resolution', () => {
    const testPath = 'C:\\bundled\\node;C:\\system'

    it('returns direct when .exe is found first in PATHEXT order', () => {
      process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD'
      mockExistsSync.mockImplementation((p) => {
        const s = p.toString()
        // Both exist in same dir, but .EXE comes before .CMD in PATHEXT
        return s === 'C:\\bundled\\node\\npx.EXE' || s === 'C:\\bundled\\node\\npx.CMD'
      })
      expect(resolveWindowsCommand('npx', testPath)).toBe('direct')
    })

    it('returns cmd-wrap when .cmd is found first in PATHEXT order', () => {
      // Custom PATHEXT where .CMD comes before .EXE
      process.env.PATHEXT = '.CMD;.EXE'
      mockExistsSync.mockImplementation((p) => {
        const s = p.toString()
        return s === 'C:\\bundled\\node\\npx.CMD' || s === 'C:\\bundled\\node\\npx.EXE'
      })
      expect(resolveWindowsCommand('npx', testPath)).toBe('cmd-wrap')
    })

    it('returns cmd-wrap when only .cmd exists (standard npx case)', () => {
      process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD'
      mockExistsSync.mockImplementation((p) =>
        p.toString() === 'C:\\bundled\\node\\npx.CMD',
      )
      expect(resolveWindowsCommand('npx', testPath)).toBe('cmd-wrap')
    })

    it('returns direct when only .exe exists (node case)', () => {
      process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD'
      mockExistsSync.mockImplementation((p) =>
        p.toString() === 'C:\\bundled\\node\\node.EXE',
      )
      expect(resolveWindowsCommand('node', testPath)).toBe('direct')
    })

    it('respects PATH directory order — first dir wins', () => {
      process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD'
      mockExistsSync.mockImplementation((p) => {
        const s = p.toString()
        // dir1 has .cmd, dir2 has .exe — dir1 wins
        return s === 'C:\\bundled\\node\\tool.CMD' || s === 'C:\\system\\tool.EXE'
      })
      expect(resolveWindowsCommand('tool', testPath)).toBe('cmd-wrap')
    })

    it('falls through to second PATH dir when first has no match', () => {
      process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD'
      mockExistsSync.mockImplementation((p) =>
        p.toString() === 'C:\\system\\tool.EXE',
      )
      expect(resolveWindowsCommand('tool', testPath)).toBe('direct')
    })

    it('returns cmd-wrap when command not found anywhere (fallback)', () => {
      process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD'
      mockExistsSync.mockReturnValue(false)
      expect(resolveWindowsCommand('unknown', testPath)).toBe('cmd-wrap')
    })

    it('uses default PATHEXT when env var is unset', () => {
      delete process.env.PATHEXT
      mockExistsSync.mockImplementation((p) =>
        p.toString() === 'C:\\bundled\\node\\npx.CMD',
      )
      // Default PATHEXT includes .CMD, so it should find npx.CMD
      expect(resolveWindowsCommand('npx', testPath)).toBe('cmd-wrap')
    })
  })
})

// ── toWinSpawn ────────────────────────────────────────────

describe('toWinSpawn', () => {
  describe('on win32', () => {
    beforeEach(() => setPlatform('win32'))

    it('wraps .cmd command through cmd.exe /c', () => {
      delete process.env.COMSPEC
      process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD'
      mockExistsSync.mockImplementation((p) =>
        p.toString().endsWith('npx.CMD'),
      )
      const result = toWinSpawn('npx', ['-y', 'open-websearch'], 'C:\\bundled\\node')
      expect(result.command).toBe('cmd.exe')
      expect(result.args).toEqual(['/c', 'npx', '-y', 'open-websearch'])
    })

    it('does NOT wrap .exe command (node)', () => {
      process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD'
      mockExistsSync.mockImplementation((p) =>
        p.toString().endsWith('node.EXE'),
      )
      const result = toWinSpawn('node', ['server.js'], 'C:\\bundled\\node')
      expect(result.command).toBe('node')
      expect(result.args).toEqual(['server.js'])
    })

    it('does NOT wrap explicit .exe path', () => {
      const result = toWinSpawn('C:\\tools\\uv.exe', ['run'], 'C:\\bundled\\node')
      expect(result.command).toBe('C:\\tools\\uv.exe')
      expect(result.args).toEqual(['run'])
    })

    it('resolves relative .cmd path to absolute for cmd.exe', () => {
      delete process.env.COMSPEC
      process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD'
      mockExistsSync.mockImplementation((p) =>
        p.toString() === 'C:\\project\\workspace\\bin\\tool.cmd',
      )
      const result = toWinSpawn('./bin/tool', ['--flag'], undefined, 'C:\\project\\workspace')
      expect(result.command).toBe('cmd.exe')
      // Should be resolved to absolute path with backslashes, not raw ./bin/tool
      expect(result.args[0]).toBe('/c')
      expect(result.args[1]).toMatch(/^C:\\/)
      expect(result.args[1]).not.toContain('/')
      expect(result.args[2]).toBe('--flag')
    })

    it('normalizes forward slashes in absolute .cmd path', () => {
      delete process.env.COMSPEC
      mockExistsSync.mockImplementation((p) =>
        p.toString().endsWith('.cmd'),
      )
      const result = toWinSpawn('C:/tools/launcher', ['run'], undefined)
      expect(result.command).toBe('cmd.exe')
      expect(result.args[1]).toBe('C:\\tools\\launcher')
    })

    it('uses COMSPEC when wrapping', () => {
      process.env.COMSPEC = 'C:\\Windows\\system32\\cmd.exe'
      process.env.PATHEXT = '.CMD'
      mockExistsSync.mockImplementation((p) =>
        p.toString().endsWith('npx.CMD'),
      )
      const result = toWinSpawn('npx', ['-y', 'server'], 'C:\\bundled\\node')
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
