import { describe, it, expect, vi } from 'vitest'
import path from 'node:path'
import { homedir } from 'node:os'
import type { FilesystemConfig } from '@golemancy/shared'

const mockRealpath = vi.hoisted(() => vi.fn())

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    default: {
      ...actual,
      realpath: mockRealpath,
    },
  }
})

import { validatePath, validatePathAsync, PathAccessError } from './validate-path'
import type { ValidatePathOptions } from './validate-path'

// ── Test Helpers ─────────────────────────────────────────────

const WORKSPACE = '/workspace'

function defaultConfig(overrides: Partial<FilesystemConfig> = {}): FilesystemConfig {
  return {
    allowWrite: ['/workspace', '/tmp'],
    denyRead: ['~/.ssh', '~/.aws', '/etc/passwd', '/etc/shadow', '**/.env', '**/secrets/**'],
    denyWrite: ['**/.git/hooks/**'],
    allowGitConfig: false,
    ...overrides,
  }
}

function opts(
  overrides: Partial<ValidatePathOptions> = {},
): ValidatePathOptions {
  return {
    inputPath: './src/index.ts',
    workspaceRoot: WORKSPACE,
    config: defaultConfig(),
    operation: 'read',
    ...overrides,
  }
}

// ── Tests ────────────────────────────────────────────────────

describe('validatePath', () => {
  // ── Normal paths ────────────────────────────────────────

  describe('normal paths', () => {
    it('resolves a relative path within workspace (read)', () => {
      const result = validatePath(opts({ inputPath: './src/index.ts' }))
      expect(result).toBe(path.normalize('/workspace/src/index.ts'))
    })

    it('resolves a relative path without ./ prefix', () => {
      const result = validatePath(opts({ inputPath: 'src/app.ts' }))
      expect(result).toBe(path.normalize('/workspace/src/app.ts'))
    })

    it('resolves an absolute path within workspace (read)', () => {
      const result = validatePath(opts({ inputPath: '/workspace/src/index.ts' }))
      expect(result).toBe(path.normalize('/workspace/src/index.ts'))
    })

    it('normalizes redundant path components', () => {
      const result = validatePath(opts({ inputPath: '/workspace/./src/../src/index.ts' }))
      expect(result).toBe(path.normalize('/workspace/src/index.ts'))
    })

    it('allows read on workspace root itself', () => {
      const result = validatePath(opts({ inputPath: '/workspace' }))
      expect(result).toBe('/workspace')
    })

    it('allows write to /tmp (in allowWrite)', () => {
      const result = validatePath(opts({
        inputPath: '/tmp/build.log',
        operation: 'write',
      }))
      expect(result).toBe(path.normalize('/tmp/build.log'))
    })

    it('allows write to workspace subdirectory', () => {
      const result = validatePath(opts({
        inputPath: 'src/app.ts',
        operation: 'write',
      }))
      expect(result).toBe(path.normalize('/workspace/src/app.ts'))
    })
  })

  // ── Null bytes ──────────────────────────────────────────

  describe('null bytes', () => {
    it('rejects path containing null byte', () => {
      expect(() => validatePath(opts({ inputPath: '/workspace/safe\0/../etc/passwd' })))
        .toThrow(PathAccessError)
    })

    it('rejects path with null byte at start', () => {
      expect(() => validatePath(opts({ inputPath: '\0/workspace/file.ts' })))
        .toThrow(PathAccessError)
    })

    it('provides correct error details for null byte', () => {
      try {
        validatePath(opts({ inputPath: 'file\0.ts' }))
        expect.unreachable('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(PathAccessError)
        expect((e as PathAccessError).reason).toBe('Path contains null byte')
      }
    })
  })

  // ── Long paths ──────────────────────────────────────────

  describe('long paths', () => {
    it('rejects path exceeding max length (1024)', () => {
      const longPath = '/workspace/' + 'a'.repeat(1020)
      expect(() => validatePath(opts({ inputPath: longPath })))
        .toThrow(PathAccessError)
    })

    it('accepts path at exactly max length', () => {
      // Path of exactly 1024 characters should pass
      const longPath = '/workspace/' + 'a'.repeat(1013)
      expect(longPath.length).toBe(1024)
      expect(() => validatePath(opts({ inputPath: longPath }))).not.toThrow()
    })
  })

  // ── Tilde expansion ────────────────────────────────────

  describe('tilde expansion', () => {
    it('expands ~ to home directory', () => {
      const home = homedir()
      const result = validatePath(opts({
        inputPath: '~',
        operation: 'read',
        config: defaultConfig({ denyRead: [] }),
      }))
      expect(result).toBe(home)
    })

    it('expands ~/path to home directory path', () => {
      const home = homedir()
      const result = validatePath(opts({
        inputPath: '~/Documents/file.txt',
        operation: 'read',
        config: defaultConfig({ denyRead: [] }),
      }))
      expect(result).toBe(path.normalize(path.join(home, 'Documents/file.txt')))
    })

    it('rejects ~otheruser paths', () => {
      expect(() => validatePath(opts({ inputPath: '~alice/.bashrc' })))
        .toThrow(PathAccessError)
    })

    it('error message for ~otheruser is descriptive', () => {
      try {
        validatePath(opts({ inputPath: '~bob/secrets' }))
        expect.unreachable('should have thrown')
      } catch (e) {
        expect((e as PathAccessError).reason).toBe('Tilde paths for other users are not allowed')
      }
    })
  })

  // ── Path traversal ─────────────────────────────────────

  describe('path traversal', () => {
    it('blocks ../../.. escaping workspace', () => {
      expect(() => validatePath(opts({ inputPath: '../../../etc/passwd' })))
        .toThrow(PathAccessError)
    })

    it('blocks encoded-style traversal outside workspace', () => {
      expect(() => validatePath(opts({ inputPath: '../../etc/shadow' })))
        .toThrow(PathAccessError)
    })

    it('allows .. that resolves within workspace', () => {
      // /workspace/src/../lib/utils.ts → /workspace/lib/utils.ts (still in workspace)
      const result = validatePath(opts({ inputPath: 'src/../lib/utils.ts' }))
      expect(result).toBe(path.normalize('/workspace/lib/utils.ts'))
    })

    it('blocks .. that escapes to root', () => {
      expect(() => validatePath(opts({
        inputPath: '../../../',
        workspaceRoot: '/workspace',
      }))).toThrow(PathAccessError)
    })
  })

  // ── Mandatory deny paths (write only) ──────────────────

  describe('mandatory deny paths', () => {
    const writeOpts = (inputPath: string, allowGitConfig = false) => opts({
      inputPath,
      operation: 'write',
      config: defaultConfig({ allowGitConfig, allowWrite: ['/workspace'] }),
    })

    it('blocks .bashrc write', () => {
      expect(() => validatePath(writeOpts('.bashrc')))
        .toThrow(PathAccessError)
    })

    it('blocks .bash_profile write', () => {
      expect(() => validatePath(writeOpts('.bash_profile')))
        .toThrow(PathAccessError)
    })

    it('blocks .zshrc write', () => {
      expect(() => validatePath(writeOpts('.zshrc')))
        .toThrow(PathAccessError)
    })

    it('blocks .zprofile write', () => {
      expect(() => validatePath(writeOpts('.zprofile')))
        .toThrow(PathAccessError)
    })

    it('blocks .profile write', () => {
      expect(() => validatePath(writeOpts('.profile')))
        .toThrow(PathAccessError)
    })

    it('blocks .git/hooks/** write', () => {
      expect(() => validatePath(writeOpts('.git/hooks/pre-commit')))
        .toThrow(PathAccessError)
    })

    it('blocks .git/hooks/pre-push write', () => {
      expect(() => validatePath(writeOpts('.git/hooks/pre-push')))
        .toThrow(PathAccessError)
    })

    it('blocks .git/config write when allowGitConfig=false', () => {
      expect(() => validatePath(writeOpts('.git/config', false)))
        .toThrow(PathAccessError)
    })

    it('allows .git/config write when allowGitConfig=true', () => {
      const result = validatePath(writeOpts('.git/config', true))
      expect(result).toBe(path.normalize('/workspace/.git/config'))
    })

    it('blocks .gitmodules write', () => {
      expect(() => validatePath(writeOpts('.gitmodules')))
        .toThrow(PathAccessError)
    })

    it('blocks .ripgreprc write', () => {
      expect(() => validatePath(writeOpts('.ripgreprc')))
        .toThrow(PathAccessError)
    })

    it('blocks .mcp.json write', () => {
      expect(() => validatePath(writeOpts('.mcp.json')))
        .toThrow(PathAccessError)
    })

    it('blocks .vscode/settings.json write', () => {
      expect(() => validatePath(writeOpts('.vscode/settings.json')))
        .toThrow(PathAccessError)
    })

    it('blocks .idea/workspace.xml write', () => {
      expect(() => validatePath(writeOpts('.idea/workspace.xml')))
        .toThrow(PathAccessError)
    })

    it('blocks .claude/settings.json write', () => {
      expect(() => validatePath(writeOpts('.claude/settings.json')))
        .toThrow(PathAccessError)
    })

    it('does NOT block mandatory deny paths for read operations', () => {
      // Mandatory deny paths only apply to writes
      const result = validatePath(opts({
        inputPath: '.bashrc',
        operation: 'read',
        config: defaultConfig({ denyRead: [] }),
      }))
      expect(result).toBe(path.normalize('/workspace/.bashrc'))
    })
  })

  // ── User-configured denyRead ───────────────────────────

  describe('denyRead patterns', () => {
    it('blocks ~/.ssh read (tilde prefix match)', () => {
      expect(() => validatePath(opts({
        inputPath: `${homedir()}/.ssh/id_rsa`,
      }))).toThrow(PathAccessError)
    })

    it('blocks ~/.aws read', () => {
      expect(() => validatePath(opts({
        inputPath: `${homedir()}/.aws/credentials`,
      }))).toThrow(PathAccessError)
    })

    it('blocks /etc/passwd read', () => {
      expect(() => validatePath(opts({ inputPath: '/etc/passwd' })))
        .toThrow(PathAccessError)
    })

    it('blocks /etc/shadow read', () => {
      expect(() => validatePath(opts({ inputPath: '/etc/shadow' })))
        .toThrow(PathAccessError)
    })

    it('blocks **/.env glob pattern', () => {
      expect(() => validatePath(opts({ inputPath: 'node_modules/.env' })))
        .toThrow(PathAccessError)
    })

    it('blocks deeply nested .env files', () => {
      expect(() => validatePath(opts({ inputPath: 'src/config/.env' })))
        .toThrow(PathAccessError)
    })

    it('blocks **/secrets/** glob', () => {
      expect(() => validatePath(opts({ inputPath: 'config/secrets/api-key.json' })))
        .toThrow(PathAccessError)
    })

    it('does not block non-matching read paths', () => {
      const result = validatePath(opts({ inputPath: 'src/index.ts' }))
      expect(result).toBe(path.normalize('/workspace/src/index.ts'))
    })
  })

  // ── User-configured denyWrite ──────────────────────────

  describe('denyWrite patterns', () => {
    it('blocks write matching denyWrite pattern', () => {
      expect(() => validatePath(opts({
        inputPath: '.git/hooks/pre-commit',
        operation: 'write',
      }))).toThrow(PathAccessError)
    })
  })

  // ── allowWrite whitelist ───────────────────────────────

  describe('allowWrite whitelist', () => {
    it('blocks write outside allowWrite list', () => {
      expect(() => validatePath(opts({
        inputPath: '/etc/hosts',
        operation: 'write',
      }))).toThrow(PathAccessError)
    })

    it('blocks write to /var', () => {
      expect(() => validatePath(opts({
        inputPath: '/var/log/syslog',
        operation: 'write',
      }))).toThrow(PathAccessError)
    })

    it('allows write to explicitly allowed path', () => {
      const result = validatePath(opts({
        inputPath: '/tmp/output.log',
        operation: 'write',
      }))
      expect(result).toBe(path.normalize('/tmp/output.log'))
    })

    it('allowWrite does not apply to read operations', () => {
      // Even though /etc/hosts is not in allowWrite, read should work
      // (assuming it's not in denyRead either)
      const result = validatePath(opts({
        inputPath: '/etc/hosts',
        operation: 'read',
        config: defaultConfig({ denyRead: [] }),
      }))
      expect(result).toBe('/etc/hosts')
    })
  })

  // ── Edge cases ─────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty string input', () => {
      // Empty string resolves to workspace root
      const result = validatePath(opts({ inputPath: '' }))
      expect(result).toBe(WORKSPACE)
    })

    it('handles "." as input (current directory)', () => {
      const result = validatePath(opts({ inputPath: '.' }))
      expect(result).toBe(WORKSPACE)
    })

    it('handles "/" root path for read', () => {
      const result = validatePath(opts({
        inputPath: '/',
        config: defaultConfig({ denyRead: [] }),
      }))
      expect(result).toBe('/')
    })

    it('blocks "/" root path for write (not in allowWrite)', () => {
      expect(() => validatePath(opts({
        inputPath: '/',
        operation: 'write',
      }))).toThrow(PathAccessError)
    })

    it('handles path with only whitespace', () => {
      // Whitespace path should resolve to workspace + spaces
      // This is technically valid (weird filenames exist)
      expect(() => validatePath(opts({ inputPath: '   ' }))).not.toThrow()
    })

    it('handles //etc/passwd (double slash normalization)', () => {
      // path.normalize('//etc/passwd') → '/etc/passwd'
      expect(() => validatePath(opts({ inputPath: '//etc/passwd' })))
        .toThrow(PathAccessError)
    })
  })

  // ── PathAccessError ────────────────────────────────────

  describe('PathAccessError', () => {
    it('has correct name', () => {
      const err = new PathAccessError('/test', 'reason')
      expect(err.name).toBe('PathAccessError')
    })

    it('has correct path and reason', () => {
      const err = new PathAccessError('/secret', 'denyRead match')
      expect(err.path).toBe('/secret')
      expect(err.reason).toBe('denyRead match')
    })

    it('has formatted message', () => {
      const err = new PathAccessError('/secret', 'denyRead match')
      expect(err.message).toBe('Access denied: /secret — denyRead match')
    })

    it('is an instance of Error', () => {
      const err = new PathAccessError('/test', 'reason')
      expect(err).toBeInstanceOf(Error)
    })
  })

  // ── Case sensitivity (macOS) ───────────────────────────

  describe('case sensitivity', () => {
    // These tests are platform-specific. On macOS (case-insensitive),
    // .ENV should match denyRead pattern **/.env.
    // On Linux (case-sensitive), .ENV would NOT match **/.env.

    if (process.platform === 'darwin') {
      it('matches .ENV against **/.env on macOS (case-insensitive)', () => {
        expect(() => validatePath(opts({ inputPath: 'config/.ENV' })))
          .toThrow(PathAccessError)
      })

      it('matches .Env against **/.env on macOS', () => {
        expect(() => validatePath(opts({ inputPath: '.Env' })))
          .toThrow(PathAccessError)
      })
    } else {
      it('does NOT match .ENV against **/.env on Linux (case-sensitive)', () => {
        expect(() => validatePath(opts({ inputPath: 'config/.ENV' })))
          .not.toThrow()
      })
    }
  })
})

// ── Async Variant Tests ────────────────────────────────────

describe('validatePathAsync', () => {
  it('returns normalized path when no symlinks (realpath returns same path)', async () => {
    mockRealpath.mockImplementation(async (p: string) => p)

    const result = await validatePathAsync(opts({ inputPath: './src/index.ts' }))
    expect(result).toBe(path.normalize('/workspace/src/index.ts'))
  })

  it('rejects symlink pointing to denied location', async () => {
    // Symlink resolves to /etc/passwd which is in denyRead
    mockRealpath.mockImplementation(async () => '/etc/passwd')

    await expect(
      validatePathAsync(opts({ inputPath: './innocent.txt' })),
    ).rejects.toThrow(PathAccessError)
  })

  it('handles ENOENT for new file in write mode (file does not exist yet)', async () => {
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    mockRealpath.mockRejectedValue(enoent)

    const result = await validatePathAsync(opts({
      inputPath: 'new-file.ts',
      operation: 'write',
    }))
    expect(result).toBe(path.normalize('/workspace/new-file.ts'))
  })

  it('re-throws non-ENOENT errors', async () => {
    const permError = Object.assign(new Error('EACCES'), { code: 'EACCES' })
    mockRealpath.mockRejectedValue(permError)

    await expect(
      validatePathAsync(opts({ inputPath: './src/index.ts' })),
    ).rejects.toThrow('EACCES')
  })
})
