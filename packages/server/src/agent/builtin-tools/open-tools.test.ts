import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeFile, rm, mkdir } from 'node:fs/promises'
import { EventEmitter } from 'node:events'

vi.mock('../../logger', () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}))

// Mock child_process.spawn to prevent real OS open commands from triggering GUI dialogs
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

import { spawn } from 'node:child_process'
import { createOpenTools, buildOpenInstructions, openPath, openPathNative } from './open-tools'

function mockSpawnExit(code: number) {
  vi.mocked(spawn).mockImplementation((() => {
    const emitter = new EventEmitter()
    process.nextTick(() => emitter.emit('close', code))
    return emitter
  }) as any)
}

function mockSpawnError(message: string) {
  vi.mocked(spawn).mockImplementation((() => {
    const emitter = new EventEmitter()
    process.nextTick(() => emitter.emit('error', new Error(message)))
    return emitter
  }) as any)
}

beforeEach(() => {
  vi.mocked(spawn).mockReset()
  mockSpawnExit(0)
})

describe('createOpenTools', () => {
  it('returns a ToolSet with OpenFile tool', () => {
    const tools = createOpenTools({ workspaceRoot: '/tmp/workspace' })
    expect(tools).toHaveProperty('OpenFile')
    expect(tools.OpenFile).toBeDefined()
  })
})

describe('buildOpenInstructions', () => {
  it('returns instructions mentioning OpenFile', () => {
    const instructions = buildOpenInstructions()
    expect(instructions).toContain('OpenFile')
    expect(instructions).toContain('File Opening')
  })

  it('warns about shell open commands not working in sandbox', () => {
    const instructions = buildOpenInstructions()
    expect(instructions).toContain('shell commands')
    expect(instructions).toContain('sandboxed')
  })
})

describe('openPath', () => {
  it('returns error when file does not exist', async () => {
    const filePath = '/tmp/nonexistent-project-xyz/missing.html'
    const result = await openPath(filePath)
    expect(result).toContain('File not found')
  })
})

describe('openPathNative', () => {
  it('calls platform-specific open command', async () => {
    const result = await openPathNative('/some/file.txt')

    expect(spawn).toHaveBeenCalledTimes(1)
    if (process.platform === 'darwin') {
      expect(spawn).toHaveBeenCalledWith('open', ['/some/file.txt'], { stdio: 'ignore' })
    } else if (process.platform === 'win32') {
      expect(spawn).toHaveBeenCalledWith('cmd', ['/c', 'start', '""', '/some/file.txt'], { stdio: 'ignore' })
    } else {
      expect(spawn).toHaveBeenCalledWith('xdg-open', ['/some/file.txt'], { stdio: 'ignore' })
    }
    expect(result).toBe('')
  })

  it('returns error message on non-zero exit code', async () => {
    mockSpawnExit(1)
    const result = await openPathNative('/some/file.txt')
    expect(result).toBe('Exit code 1')
  })

  it('returns error message on spawn failure', async () => {
    mockSpawnError('spawn open ENOENT')
    const result = await openPathNative('/some/file.txt')
    expect(result).toBe('spawn open ENOENT')
  })
})

describe('OpenFile tool execute', () => {
  it('resolves relative paths against workspace', async () => {
    const workspaceRoot = '/tmp/test-open-tools-workspace'
    const tools = createOpenTools({ workspaceRoot })

    // File doesn't exist, so we expect a file-not-found error
    const result = await (tools.OpenFile as any).execute(
      { path: 'nonexistent-output.html' },
      { toolCallId: 'tc-1', messages: [], abortSignal: new AbortController().signal },
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('File not found')
    // Verify the path was resolved against workspace
    expect(result.error).toContain(join(workspaceRoot, 'nonexistent-output.html'))
  })

  it('opens file successfully', async () => {
    const testDir = join(tmpdir(), '_test-open-tools-' + Date.now())
    await mkdir(testDir, { recursive: true })
    const testFile = join(testDir, 'test-open.html')
    await writeFile(testFile, '<html>test</html>')

    try {
      const tools = createOpenTools({ workspaceRoot: testDir })
      const result = await (tools.OpenFile as any).execute(
        { path: 'test-open.html' },
        { toolCallId: 'tc-1', messages: [], abortSignal: new AbortController().signal },
      )

      expect(result.success).toBe(true)
      expect(result.path).toBe(testFile)
      expect(spawn).toHaveBeenCalledTimes(1)
    } finally {
      await rm(testDir, { recursive: true, force: true })
    }
  })
})
