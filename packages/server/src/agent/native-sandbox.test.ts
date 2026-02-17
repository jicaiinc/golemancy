import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────

const mockReadFile = vi.fn()
const mockWriteFile = vi.fn()
const mockMkdir = vi.fn()

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: (...args: unknown[]) => mockReadFile(...args),
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
    mkdir: (...args: unknown[]) => mockMkdir(...args),
  },
}))

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
    const EventEmitter = require('node:events')
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.stdin = null
    child.killed = false
    child.kill = vi.fn()
    // Simulate successful command execution
    process.nextTick(() => {
      child.stdout.emit('data', Buffer.from('output\n'))
      child.stderr.emit('data', Buffer.from(''))
      child.emit('close', 0, null)
    })
    return child
  }),
}))

import { NativeSandbox } from './native-sandbox'

// ── Test Helpers ─────────────────────────────────────────────

const WORKSPACE = '/workspace'

function makeSandbox(timeoutMs?: number): NativeSandbox {
  return new NativeSandbox({
    workspaceRoot: WORKSPACE,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  })
}

// ── Tests ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockReadFile.mockResolvedValue('file content')
  mockWriteFile.mockResolvedValue(undefined)
  mockMkdir.mockResolvedValue(undefined)
})

describe('NativeSandbox', () => {
  // ── Constructor ────────────────────────────────────────────

  describe('constructor', () => {
    it('accepts required options', () => {
      expect(() => new NativeSandbox({ workspaceRoot: '/workspace' })).not.toThrow()
    })

    it('accepts optional timeoutMs', () => {
      expect(() => new NativeSandbox({
        workspaceRoot: '/workspace',
        timeoutMs: 60_000,
      })).not.toThrow()
    })
  })

  // ── executeCommand ────────────────────────────────────────

  describe('executeCommand', () => {
    it('spawns bash with the command', async () => {
      const { spawn } = await import('node:child_process')
      const sandbox = makeSandbox()
      await sandbox.executeCommand('ls -la')

      expect(spawn).toHaveBeenCalledWith('bash', ['-c', 'ls -la'], expect.objectContaining({
        cwd: WORKSPACE,
        stdio: ['ignore', 'pipe', 'pipe'],
      }))
    })

    it('passes process.env to child', async () => {
      const { spawn } = await import('node:child_process')
      const sandbox = makeSandbox()
      await sandbox.executeCommand('echo hello')

      expect(spawn).toHaveBeenCalledWith('bash', expect.any(Array), expect.objectContaining({
        env: process.env,
      }))
    })

    it('returns stdout, stderr, and exitCode', async () => {
      const sandbox = makeSandbox()
      const result = await sandbox.executeCommand('echo hello')
      expect(result).toHaveProperty('stdout')
      expect(result).toHaveProperty('stderr')
      expect(result).toHaveProperty('exitCode')
    })

    it('returns exitCode 0 for successful command', async () => {
      const sandbox = makeSandbox()
      const result = await sandbox.executeCommand('echo hello')
      expect(result.exitCode).toBe(0)
    })

    it('captures stdout from command', async () => {
      const sandbox = makeSandbox()
      const result = await sandbox.executeCommand('echo hello')
      expect(result.stdout).toBe('output\n')
    })

    it('returns non-zero exit code for failed command', async () => {
      const { spawn } = await import('node:child_process')
      vi.mocked(spawn).mockImplementationOnce(() => {
        const EventEmitter = require('node:events')
        const child = new EventEmitter()
        child.stdout = new EventEmitter()
        child.stderr = new EventEmitter()
        child.killed = false
        child.kill = vi.fn()
        process.nextTick(() => {
          child.stderr.emit('data', Buffer.from('command not found\n'))
          child.emit('close', 127, null)
        })
        return child as any
      })

      const sandbox = makeSandbox()
      const result = await sandbox.executeCommand('nonexistent')
      expect(result.exitCode).toBe(127)
      expect(result.stderr).toContain('command not found')
    })

    it('defaults exitCode to 1 when code is null', async () => {
      const { spawn } = await import('node:child_process')
      vi.mocked(spawn).mockImplementationOnce(() => {
        const EventEmitter = require('node:events')
        const child = new EventEmitter()
        child.stdout = new EventEmitter()
        child.stderr = new EventEmitter()
        child.killed = false
        child.kill = vi.fn()
        process.nextTick(() => {
          child.emit('close', null, null)
        })
        return child as any
      })

      const sandbox = makeSandbox()
      const result = await sandbox.executeCommand('test')
      expect(result.exitCode).toBe(1)
    })

    it('rejects when spawn emits error', async () => {
      const { spawn } = await import('node:child_process')
      vi.mocked(spawn).mockImplementationOnce(() => {
        const EventEmitter = require('node:events')
        const child = new EventEmitter()
        child.stdout = new EventEmitter()
        child.stderr = new EventEmitter()
        child.killed = false
        child.kill = vi.fn()
        process.nextTick(() => {
          child.emit('error', new Error('spawn ENOENT'))
        })
        return child as any
      })

      const sandbox = makeSandbox()
      await expect(sandbox.executeCommand('bad')).rejects.toThrow('spawn ENOENT')
    })

    it('blocks catastrophic commands even in unrestricted mode (builtin dangerous patterns)', async () => {
      // NativeSandbox now checks BUILTIN_DANGEROUS_PATTERNS (fork bombs, rm /, dd to device)
      const sandbox = makeSandbox()
      await expect(sandbox.executeCommand('sudo rm -rf /')).rejects.toThrow('Command blocked')
    })

    it('allows normal commands in unrestricted mode', async () => {
      const sandbox = makeSandbox()
      const result = await sandbox.executeCommand('echo hello')
      expect(result.exitCode).toBe(0)
    })

    it('does NOT wrap command with sandbox', async () => {
      const { spawn } = await import('node:child_process')
      const sandbox = makeSandbox()
      await sandbox.executeCommand('git status')

      // The command should be passed directly — no wrapping
      expect(spawn).toHaveBeenCalledWith('bash', ['-c', 'git status'], expect.any(Object))
    })
  })

  // ── executeCommand: timeout ────────────────────────────────

  describe('executeCommand timeout', () => {
    it('reports exitCode 124 on SIGTERM timeout', async () => {
      const { spawn } = await import('node:child_process')
      vi.mocked(spawn).mockImplementationOnce(() => {
        const EventEmitter = require('node:events')
        const child = new EventEmitter()
        child.stdout = new EventEmitter()
        child.stderr = new EventEmitter()
        child.killed = false
        child.kill = vi.fn()
        process.nextTick(() => {
          child.emit('close', null, 'SIGTERM')
        })
        return child as any
      })

      const sandbox = makeSandbox()
      const result = await sandbox.executeCommand('sleep 999')
      expect(result.exitCode).toBe(124)
      expect(result.stderr).toContain('timed out')
    })

    it('reports exitCode 124 on SIGKILL timeout', async () => {
      const { spawn } = await import('node:child_process')
      vi.mocked(spawn).mockImplementationOnce(() => {
        const EventEmitter = require('node:events')
        const child = new EventEmitter()
        child.stdout = new EventEmitter()
        child.stderr = new EventEmitter()
        child.killed = false
        child.kill = vi.fn()
        process.nextTick(() => {
          child.emit('close', null, 'SIGKILL')
        })
        return child as any
      })

      const sandbox = makeSandbox()
      const result = await sandbox.executeCommand('sleep 999')
      expect(result.exitCode).toBe(124)
    })
  })

  // ── executeCommand: output truncation ─────────────────────

  describe('executeCommand output truncation', () => {
    it('truncates stdout exceeding 1MB', async () => {
      const { spawn } = await import('node:child_process')
      const bigData = Buffer.alloc(1_100_000, 'A') // > 1MB

      vi.mocked(spawn).mockImplementationOnce(() => {
        const EventEmitter = require('node:events')
        const child = new EventEmitter()
        child.stdout = new EventEmitter()
        child.stderr = new EventEmitter()
        child.killed = false
        child.kill = vi.fn()
        process.nextTick(() => {
          child.stdout.emit('data', bigData)
          child.emit('close', 0, null)
        })
        return child as any
      })

      const sandbox = makeSandbox()
      const result = await sandbox.executeCommand('cat bigfile')
      expect(result.stdout).toContain('[output truncated at 1MB]')
    })

    it('truncates stderr exceeding 1MB', async () => {
      const { spawn } = await import('node:child_process')
      const bigData = Buffer.alloc(1_100_000, 'E')

      vi.mocked(spawn).mockImplementationOnce(() => {
        const EventEmitter = require('node:events')
        const child = new EventEmitter()
        child.stdout = new EventEmitter()
        child.stderr = new EventEmitter()
        child.killed = false
        child.kill = vi.fn()
        process.nextTick(() => {
          child.stderr.emit('data', bigData)
          child.emit('close', 1, null)
        })
        return child as any
      })

      const sandbox = makeSandbox()
      const result = await sandbox.executeCommand('bad-cmd')
      expect(result.stderr).toContain('[output truncated at 1MB]')
    })

    it('does not truncate output under 1MB', async () => {
      const { spawn } = await import('node:child_process')
      const data = 'hello world\n'

      vi.mocked(spawn).mockImplementationOnce(() => {
        const EventEmitter = require('node:events')
        const child = new EventEmitter()
        child.stdout = new EventEmitter()
        child.stderr = new EventEmitter()
        child.killed = false
        child.kill = vi.fn()
        process.nextTick(() => {
          child.stdout.emit('data', Buffer.from(data))
          child.emit('close', 0, null)
        })
        return child as any
      })

      const sandbox = makeSandbox()
      const result = await sandbox.executeCommand('echo hello world')
      expect(result.stdout).toBe(data)
      expect(result.stdout).not.toContain('truncated')
    })
  })

  // ── readFile ──────────────────────────────────────────────

  describe('readFile', () => {
    it('reads file using absolute path', async () => {
      const sandbox = makeSandbox()
      const content = await sandbox.readFile('/etc/hosts')
      expect(mockReadFile).toHaveBeenCalledWith('/etc/hosts', 'utf-8')
      expect(content).toBe('file content')
    })

    it('resolves relative path against workspaceRoot', async () => {
      const sandbox = makeSandbox()
      await sandbox.readFile('src/index.ts')
      expect(mockReadFile).toHaveBeenCalledWith('/workspace/src/index.ts', 'utf-8')
    })

    it('resolves ./relative path against workspaceRoot', async () => {
      const sandbox = makeSandbox()
      await sandbox.readFile('./test.txt')
      expect(mockReadFile).toHaveBeenCalledWith('/workspace/test.txt', 'utf-8')
    })

    it('does NOT validate path (unrestricted mode)', async () => {
      // NativeSandbox should allow reading any file
      const sandbox = makeSandbox()
      await sandbox.readFile('/etc/passwd')
      expect(mockReadFile).toHaveBeenCalledWith('/etc/passwd', 'utf-8')
    })

    it('does NOT block ~/.ssh read (unrestricted mode)', async () => {
      const sandbox = makeSandbox()
      await sandbox.readFile('/home/user/.ssh/id_rsa')
      expect(mockReadFile).toHaveBeenCalledWith('/home/user/.ssh/id_rsa', 'utf-8')
    })

    it('propagates fs errors', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'))
      const sandbox = makeSandbox()
      await expect(sandbox.readFile('missing.txt')).rejects.toThrow('ENOENT')
    })
  })

  // ── writeFiles ────────────────────────────────────────────

  describe('writeFiles', () => {
    it('writes file with absolute path', async () => {
      const sandbox = makeSandbox()
      await sandbox.writeFiles([{ path: '/tmp/output.txt', content: 'hello' }])
      expect(mockWriteFile).toHaveBeenCalledWith('/tmp/output.txt', 'hello')
    })

    it('resolves relative path against workspaceRoot', async () => {
      const sandbox = makeSandbox()
      await sandbox.writeFiles([{ path: 'src/new.ts', content: 'code' }])
      expect(mockWriteFile).toHaveBeenCalledWith('/workspace/src/new.ts', 'code')
    })

    it('creates parent directory with recursive: true', async () => {
      const sandbox = makeSandbox()
      await sandbox.writeFiles([{ path: 'deep/nested/file.ts', content: 'data' }])
      expect(mockMkdir).toHaveBeenCalledWith('/workspace/deep/nested', { recursive: true })
    })

    it('writes multiple files', async () => {
      const sandbox = makeSandbox()
      await sandbox.writeFiles([
        { path: 'a.ts', content: 'a' },
        { path: 'b.ts', content: 'b' },
        { path: 'c.ts', content: 'c' },
      ])
      expect(mockWriteFile).toHaveBeenCalledTimes(3)
      expect(mockMkdir).toHaveBeenCalledTimes(3)
    })

    it('handles empty files array', async () => {
      const sandbox = makeSandbox()
      await sandbox.writeFiles([])
      expect(mockWriteFile).not.toHaveBeenCalled()
      expect(mockMkdir).not.toHaveBeenCalled()
    })

    it('does NOT validate path (unrestricted mode)', async () => {
      // NativeSandbox allows writing anywhere
      const sandbox = makeSandbox()
      await sandbox.writeFiles([{ path: '/etc/hosts', content: 'malicious' }])
      expect(mockWriteFile).toHaveBeenCalledWith('/etc/hosts', 'malicious')
    })

    it('does NOT block .git/hooks write (unrestricted mode)', async () => {
      const sandbox = makeSandbox()
      await sandbox.writeFiles([{ path: '.git/hooks/pre-commit', content: '#!/bin/sh' }])
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/workspace/.git/hooks/pre-commit',
        '#!/bin/sh',
      )
    })

    it('accepts Buffer content', async () => {
      const sandbox = makeSandbox()
      const buf = Buffer.from('binary data')
      await sandbox.writeFiles([{ path: 'file.bin', content: buf }])
      expect(mockWriteFile).toHaveBeenCalledWith('/workspace/file.bin', buf)
    })

    it('propagates fs errors', async () => {
      mockMkdir.mockRejectedValueOnce(new Error('EACCES'))
      const sandbox = makeSandbox()
      await expect(
        sandbox.writeFiles([{ path: 'file.ts', content: 'code' }]),
      ).rejects.toThrow('EACCES')
    })
  })
})
