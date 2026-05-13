import { describe, it, expect, vi, beforeEach } from 'vitest'
import EventEmitter from 'node:events'

// ── Mocks ────────────────────────────────────────────────────

const mockSpawn = vi.fn()

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}))

vi.mock('./paths', () => ({
  getBundledNodeBinDir: vi.fn(() => null),
}))

import { getNodeRuntimeStatus } from './node-manager'
import { getBundledNodeBinDir } from './paths'

// ── Helpers ──────────────────────────────────────────────────

function createMockChild(stdout = '', exitCode = 0) {
  const child = new EventEmitter() as any
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdin = null
  child.killed = false
  child.kill = vi.fn()
  process.nextTick(() => {
    if (stdout) child.stdout.emit('data', Buffer.from(stdout))
    child.emit('close', exitCode, null)
  })
  return child
}

function createErrorChild() {
  const child = new EventEmitter() as any
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdin = null
  child.killed = false
  child.kill = vi.fn()
  process.nextTick(() => {
    child.emit('error', new Error('spawn ENOENT'))
  })
  return child
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Tests ────────────────────────────────────────────────────

describe('getNodeRuntimeStatus', () => {
  it('returns not available when bundled node dir is null', async () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue(null)
    const status = await getNodeRuntimeStatus()
    expect(status.available).toBe(false)
    expect(status.nodeVersion).toBeNull()
    expect(status.npmVersion).toBeNull()
    expect(status.binDir).toBeNull()
  })

  it('returns available with versions when binaries exist', async () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue('/bundled/node/bin')
    mockSpawn.mockImplementation((binary: string) => {
      if (binary.endsWith('node')) return createMockChild('v22.22.0')
      if (binary.endsWith('npm')) return createMockChild('10.9.2')
      return createMockChild()
    })

    const status = await getNodeRuntimeStatus()
    expect(status.available).toBe(true)
    expect(status.nodeVersion).toBe('22.22.0') // v prefix stripped
    expect(status.npmVersion).toBe('10.9.2')
    expect(status.binDir).toBe('/bundled/node/bin')
  })

  it('strips v prefix from node version', async () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue('/bundled/node/bin')
    mockSpawn.mockImplementation((binary: string) => {
      if (binary.endsWith('node')) return createMockChild('v22.22.0')
      return createMockChild('10.9.2')
    })

    const status = await getNodeRuntimeStatus()
    expect(status.nodeVersion).toBe('22.22.0')
  })

  it('returns not available when node binary fails', async () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue('/bundled/node/bin')
    mockSpawn.mockImplementation(() => createErrorChild())

    const status = await getNodeRuntimeStatus()
    expect(status.available).toBe(false)
    expect(status.nodeVersion).toBeNull()
    expect(status.npmVersion).toBeNull()
  })

  it('returns null npm version when npm fails but node succeeds', async () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue('/bundled/node/bin')
    mockSpawn.mockImplementation((binary: string) => {
      if (binary.endsWith('node')) return createMockChild('v22.22.0')
      return createMockChild('', 1) // npm fails
    })

    const status = await getNodeRuntimeStatus()
    expect(status.available).toBe(true)
    expect(status.nodeVersion).toBe('22.22.0')
    expect(status.npmVersion).toBeNull()
  })

  it('calls node --version and npm --version with correct paths', async () => {
    vi.mocked(getBundledNodeBinDir).mockReturnValue('/bundled/node/bin')
    mockSpawn.mockImplementation(() => createMockChild('v1.0.0'))

    await getNodeRuntimeStatus()
    expect(mockSpawn).toHaveBeenCalledWith(
      '/bundled/node/bin/node',
      ['--version'],
      expect.objectContaining({ stdio: ['ignore', 'pipe', 'ignore'] }),
    )
    expect(mockSpawn).toHaveBeenCalledWith(
      '/bundled/node/bin/npm',
      ['--version'],
      expect.objectContaining({ stdio: ['ignore', 'pipe', 'ignore'] }),
    )
  })
})
