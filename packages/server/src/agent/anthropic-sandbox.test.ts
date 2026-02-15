import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SandboxConfig } from '@golemancy/shared'
import { PathAccessError } from './validate-path'
import { CommandBlockedError } from './check-command-blacklist'

// ── Mocks ────────────────────────────────────────────────────

const mockWrapWithSandbox = vi.fn()
const mockCleanupAfterCommand = vi.fn()

const mockReadFile = vi.fn()
const mockWriteFile = vi.fn()
const mockMkdir = vi.fn()

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: (...args: unknown[]) => mockReadFile(...args),
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
    mkdir: (...args: unknown[]) => mockMkdir(...args),
    realpath: vi.fn().mockImplementation(async (p: string) => p),
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

vi.mock('../logger', () => ({
  logger: {
    child: () => ({
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    }),
  },
}))

import { AnthropicSandbox } from './anthropic-sandbox'
import type { SandboxManagerHandle } from './anthropic-sandbox'

// ── Test Helpers ─────────────────────────────────────────────

const WORKSPACE = '/workspace'

/** Test-local default SandboxConfig (replaces deleted PRESET_BALANCED) */
const DEFAULT_TEST_CONFIG: SandboxConfig = {
  filesystem: {
    allowWrite: ['/workspace', '/workspace/**'],
    denyRead: ['~/.ssh/**', '~/.gnupg/**', '**/.env', '**/.env.*', '/etc/shadow', '/etc/passwd'],
    denyWrite: [],
    allowGitConfig: false,
  },
  network: {
    allowedDomains: ['*'],
  },
  enablePython: true,
  deniedCommands: [],
}

function makeHandle(): SandboxManagerHandle {
  return {
    wrapWithSandbox: mockWrapWithSandbox,
    cleanupAfterCommand: mockCleanupAfterCommand,
  }
}

function makeConfig(overrides: Partial<SandboxConfig> = {}): SandboxConfig {
  return {
    ...DEFAULT_TEST_CONFIG,
    ...overrides,
  }
}

function makeSandbox(overrides: Partial<SandboxConfig> = {}): AnthropicSandbox {
  return new AnthropicSandbox({
    config: makeConfig(overrides),
    workspaceRoot: WORKSPACE,
    sandboxManager: makeHandle(),
  })
}

// ── Tests ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockWrapWithSandbox.mockResolvedValue('sandbox-exec -- bash -c "ls -la"')
  mockCleanupAfterCommand.mockResolvedValue(undefined)
  mockReadFile.mockResolvedValue('file content')
  mockWriteFile.mockResolvedValue(undefined)
  mockMkdir.mockResolvedValue(undefined)
})

describe('AnthropicSandbox', () => {
  // ── executeCommand ────────────────────────────────────────

  describe('executeCommand', () => {
    it('calls wrapWithSandbox before spawning', async () => {
      const sandbox = makeSandbox()
      await sandbox.executeCommand('ls -la')
      expect(mockWrapWithSandbox).toHaveBeenCalledWith('ls -la')
    })

    it('calls cleanupAfterCommand after execution', async () => {
      const sandbox = makeSandbox()
      await sandbox.executeCommand('ls -la')
      expect(mockCleanupAfterCommand).toHaveBeenCalled()
    })

    it('calls cleanupAfterCommand even when spawn throws', async () => {
      const { spawn } = await import('node:child_process')
      vi.mocked(spawn).mockImplementationOnce(() => {
        throw new Error('spawn failed')
      })

      const sandbox = makeSandbox()
      await expect(sandbox.executeCommand('ls -la')).rejects.toThrow('spawn failed')
      expect(mockCleanupAfterCommand).toHaveBeenCalled()
    })

    it('returns stdout, stderr, and exitCode', async () => {
      const sandbox = makeSandbox()
      const result = await sandbox.executeCommand('echo hello')
      expect(result).toHaveProperty('stdout')
      expect(result).toHaveProperty('stderr')
      expect(result).toHaveProperty('exitCode')
    })

    it('blocks denied commands before calling wrapWithSandbox', async () => {
      const sandbox = makeSandbox({ deniedCommands: ['sudo'] })
      await expect(sandbox.executeCommand('sudo rm -rf /')).rejects.toThrow(CommandBlockedError)
      // wrapWithSandbox should NOT have been called
      expect(mockWrapWithSandbox).not.toHaveBeenCalled()
    })

    it('blocks commands matching builtin dangerous patterns', async () => {
      const sandbox = makeSandbox()
      await expect(sandbox.executeCommand('mkfs.ext4 /dev/sda1')).rejects.toThrow(CommandBlockedError)
      expect(mockWrapWithSandbox).not.toHaveBeenCalled()
    })

    it('allows safe commands', async () => {
      const sandbox = makeSandbox()
      await sandbox.executeCommand('git status')
      expect(mockWrapWithSandbox).toHaveBeenCalledWith('git status')
    })

    it('cleans up even when cleanup itself fails (non-fatal)', async () => {
      mockCleanupAfterCommand.mockRejectedValueOnce(new Error('cleanup error'))
      const sandbox = makeSandbox()
      // Should not throw — cleanup failure is logged but not propagated
      const result = await sandbox.executeCommand('ls')
      expect(result).toHaveProperty('exitCode')
      expect(mockCleanupAfterCommand).toHaveBeenCalled()
    })
  })

  // ── readFile ──────────────────────────────────────────────

  describe('readFile', () => {
    it('reads file within workspace', async () => {
      const sandbox = makeSandbox()
      const content = await sandbox.readFile('./src/index.ts')
      expect(mockReadFile).toHaveBeenCalled()
      expect(content).toBe('file content')
    })

    it('blocks reading denied paths (~/.ssh)', async () => {
      const sandbox = makeSandbox()
      // The path validation will block ~/.ssh via denyRead pattern
      await expect(sandbox.readFile('~/.ssh/id_rsa')).rejects.toThrow()
    })

    it('blocks reading /etc/passwd', async () => {
      const sandbox = makeSandbox()
      await expect(sandbox.readFile('/etc/passwd')).rejects.toThrow()
    })

    it('blocks reading .env files', async () => {
      const sandbox = makeSandbox()
      await expect(sandbox.readFile('.env')).rejects.toThrow()
    })

    it('reads file using utf-8 encoding', async () => {
      const sandbox = makeSandbox()
      await sandbox.readFile('./test.txt')
      expect(mockReadFile).toHaveBeenCalledWith(
        expect.any(String),
        'utf-8',
      )
    })
  })

  // ── writeFiles ────────────────────────────────────────────

  describe('writeFiles', () => {
    it('writes file within workspace', async () => {
      const sandbox = makeSandbox()
      await sandbox.writeFiles([{ path: './src/new.ts', content: 'hello' }])
      expect(mockMkdir).toHaveBeenCalled()
      expect(mockWriteFile).toHaveBeenCalled()
    })

    it('creates parent directory with recursive: true', async () => {
      const sandbox = makeSandbox()
      await sandbox.writeFiles([{ path: './deep/nested/file.ts', content: 'code' }])
      expect(mockMkdir).toHaveBeenCalledWith(
        expect.any(String),
        { recursive: true },
      )
    })

    it('writes multiple files', async () => {
      const sandbox = makeSandbox()
      await sandbox.writeFiles([
        { path: './a.ts', content: 'a' },
        { path: './b.ts', content: 'b' },
      ])
      expect(mockWriteFile).toHaveBeenCalledTimes(2)
    })

    it('blocks writing to denied paths (.git/hooks)', async () => {
      const sandbox = makeSandbox()
      await expect(
        sandbox.writeFiles([{ path: '.git/hooks/pre-commit', content: 'evil' }]),
      ).rejects.toThrow()
    })

    it('blocks writing outside allowWrite list', async () => {
      const sandbox = makeSandbox()
      await expect(
        sandbox.writeFiles([{ path: '/etc/hosts', content: 'malicious' }]),
      ).rejects.toThrow()
    })

    it('blocks writing to .bashrc (mandatory deny)', async () => {
      const sandbox = makeSandbox()
      await expect(
        sandbox.writeFiles([{ path: '.bashrc', content: 'export EVIL=1' }]),
      ).rejects.toThrow()
    })

    it('blocks writing to .vscode/settings.json (mandatory deny)', async () => {
      const sandbox = makeSandbox()
      await expect(
        sandbox.writeFiles([{ path: '.vscode/settings.json', content: '{}' }]),
      ).rejects.toThrow()
    })

    it('handles empty files array', async () => {
      const sandbox = makeSandbox()
      await sandbox.writeFiles([])
      expect(mockWriteFile).not.toHaveBeenCalled()
    })
  })

  // ── SandboxManagerHandle interface ────────────────────────

  describe('SandboxManagerHandle', () => {
    it('calls handle.wrapWithSandbox with the command', async () => {
      const sandbox = makeSandbox()
      await sandbox.executeCommand('npm test')
      expect(mockWrapWithSandbox).toHaveBeenCalledWith('npm test')
    })

    it('calls handle.cleanupAfterCommand after each command', async () => {
      const sandbox = makeSandbox()
      await sandbox.executeCommand('ls')
      await sandbox.executeCommand('pwd')
      expect(mockCleanupAfterCommand).toHaveBeenCalledTimes(2)
    })
  })

  // ── Constructor ────────────────────────────────────────────

  describe('constructor', () => {
    it('accepts all required options', () => {
      expect(() => new AnthropicSandbox({
        config: makeConfig(),
        workspaceRoot: '/workspace',
        sandboxManager: makeHandle(),
      })).not.toThrow()
    })

    it('accepts optional timeoutMs', () => {
      expect(() => new AnthropicSandbox({
        config: makeConfig(),
        workspaceRoot: '/workspace',
        sandboxManager: makeHandle(),
        timeoutMs: 60_000,
      })).not.toThrow()
    })
  })
})
