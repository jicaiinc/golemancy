import { describe, it, expect, vi, beforeEach } from 'vitest'
import EventEmitter from 'node:events'

// ── Mocks ────────────────────────────────────────────────────

const mockSpawn = vi.fn()
const mockMkdir = vi.fn()
const mockRm = vi.fn()
const mockAccess = vi.fn()

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}))

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: (...args: unknown[]) => mockMkdir(...args),
    rm: (...args: unknown[]) => mockRm(...args),
    access: (...args: unknown[]) => mockAccess(...args),
  },
}))

vi.mock('./paths', () => ({
  getBundledCertFilePath: vi.fn(() => null),
  getBundledPythonPath: vi.fn(() => null),
  getProjectPythonEnvPath: vi.fn((id: string) => `/data/projects/${id}/runtime/python-env`),
  getProjectPythonEnvBinPath: vi.fn((id: string) => `/data/projects/${id}/runtime/python-env/bin`),
  getPipCachePath: vi.fn(() => '/data/runtime/cache/pip'),
}))

vi.mock('../logger', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}))

import {
  resolvePythonBinary,
  initProjectPythonEnv,
  removeProjectPythonEnv,
  resetProjectPythonEnv,
  installPackages,
  uninstallPackage,
  listPackages,
  getPythonEnvStatus,
} from './python-manager'
import { getBundledPythonPath } from './paths'

// ── Helpers ──────────────────────────────────────────────────

function createMockChild(
  stdout = '',
  stderr = '',
  exitCode = 0,
) {
  const child = new EventEmitter() as any
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdin = null
  child.killed = false
  child.kill = vi.fn()
  process.nextTick(() => {
    if (stdout) child.stdout.emit('data', Buffer.from(stdout))
    if (stderr) child.stderr.emit('data', Buffer.from(stderr))
    child.emit('close', exitCode, null)
  })
  return child
}

beforeEach(() => {
  vi.clearAllMocks()
  mockMkdir.mockResolvedValue(undefined)
  mockRm.mockResolvedValue(undefined)
  mockAccess.mockResolvedValue(undefined)
  mockSpawn.mockImplementation(() => createMockChild())
})

// ── Tests ────────────────────────────────────────────────────

describe('resolvePythonBinary', () => {
  it('returns system python3 when bundled not available', () => {
    vi.mocked(getBundledPythonPath).mockReturnValue(null)
    expect(resolvePythonBinary()).toBe('python3')
  })

  it('returns bundled path when available', () => {
    vi.mocked(getBundledPythonPath).mockReturnValue('/bundled/python/bin/python3.13')
    expect(resolvePythonBinary()).toBe('/bundled/python/bin/python3.13')
  })
})

describe('initProjectPythonEnv', () => {
  it('creates parent directory', async () => {
    await initProjectPythonEnv('proj-abc123')
    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining('proj-abc123'),
      { recursive: true },
    )
  })

  it('spawns python -m venv with correct path', async () => {
    await initProjectPythonEnv('proj-abc123')
    expect(mockSpawn).toHaveBeenCalledWith(
      expect.any(String),
      ['-m', 'venv', '/data/projects/proj-abc123/runtime/python-env'],
      expect.objectContaining({
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    )
  })

  it('throws when venv creation fails', async () => {
    mockSpawn.mockImplementation(() => createMockChild('', 'error creating venv', 1))
    await expect(initProjectPythonEnv('proj-abc123')).rejects.toThrow('Failed to create Python venv')
  })

  it('succeeds when exit code is 0', async () => {
    mockSpawn.mockImplementation(() => createMockChild())
    await expect(initProjectPythonEnv('proj-abc123')).resolves.toBeUndefined()
  })
})

describe('removeProjectPythonEnv', () => {
  it('removes venv directory recursively', async () => {
    await removeProjectPythonEnv('proj-abc123')
    expect(mockRm).toHaveBeenCalledWith(
      '/data/projects/proj-abc123/runtime/python-env',
      { recursive: true, force: true },
    )
  })
})

describe('resetProjectPythonEnv', () => {
  it('removes then recreates the venv', async () => {
    await resetProjectPythonEnv('proj-abc123')
    // Should have called rm (remove) and then spawn (create)
    expect(mockRm).toHaveBeenCalled()
    expect(mockSpawn).toHaveBeenCalled()
  })
})

describe('installPackages', () => {
  it('throws when packages array is empty', async () => {
    await expect(installPackages('proj-abc123', [])).rejects.toThrow('No packages specified')
  })

  it('spawns pip install with correct args', async () => {
    mockSpawn.mockImplementation(() => createMockChild('Successfully installed numpy'))
    await installPackages('proj-abc123', ['numpy'])
    expect(mockSpawn).toHaveBeenCalledWith(
      '/data/projects/proj-abc123/runtime/python-env/bin/pip',
      ['install', 'numpy'],
      expect.objectContaining({
        env: expect.objectContaining({ PIP_CACHE_DIR: '/data/runtime/cache/pip' }),
      }),
    )
  })

  it('installs multiple packages', async () => {
    mockSpawn.mockImplementation(() => createMockChild('done'))
    await installPackages('proj-abc123', ['numpy', 'pandas'])
    expect(mockSpawn).toHaveBeenCalledWith(
      expect.any(String),
      ['install', 'numpy', 'pandas'],
      expect.any(Object),
    )
  })

  it('returns stdout on success', async () => {
    mockSpawn.mockImplementation(() => createMockChild('Successfully installed numpy-1.26.0'))
    const result = await installPackages('proj-abc123', ['numpy'])
    expect(result).toContain('Successfully installed')
  })

  it('throws on pip failure', async () => {
    mockSpawn.mockImplementation(() => createMockChild('', 'ERROR: No matching distribution', 1))
    await expect(installPackages('proj-abc123', ['nonexistent-pkg'])).rejects.toThrow('pip install failed')
  })
})

describe('uninstallPackage', () => {
  it('spawns pip uninstall with -y flag', async () => {
    mockSpawn.mockImplementation(() => createMockChild('Successfully uninstalled'))
    await uninstallPackage('proj-abc123', 'numpy')
    expect(mockSpawn).toHaveBeenCalledWith(
      '/data/projects/proj-abc123/runtime/python-env/bin/pip',
      ['uninstall', '-y', 'numpy'],
      expect.any(Object),
    )
  })

  it('throws on pip failure', async () => {
    mockSpawn.mockImplementation(() => createMockChild('', 'ERROR: not installed', 1))
    await expect(uninstallPackage('proj-abc123', 'nonexistent')).rejects.toThrow('pip uninstall failed')
  })
})

describe('listPackages', () => {
  it('spawns pip list --format=json', async () => {
    const packages = [{ name: 'pip', version: '24.0' }, { name: 'numpy', version: '1.26.0' }]
    mockSpawn.mockImplementation(() => createMockChild(JSON.stringify(packages)))
    const result = await listPackages('proj-abc123')
    expect(mockSpawn).toHaveBeenCalledWith(
      '/data/projects/proj-abc123/runtime/python-env/bin/pip',
      ['list', '--format=json'],
      expect.any(Object),
    )
    expect(result).toEqual(packages)
  })

  it('throws on pip failure', async () => {
    mockSpawn.mockImplementation(() => createMockChild('', 'error', 1))
    await expect(listPackages('proj-abc123')).rejects.toThrow('pip list failed')
  })

  it('throws on invalid JSON output', async () => {
    mockSpawn.mockImplementation(() => createMockChild('not json'))
    await expect(listPackages('proj-abc123')).rejects.toThrow('Failed to parse pip list output')
  })
})

describe('getPythonEnvStatus', () => {
  it('returns exists: false when venv dir does not exist', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'))
    const status = await getPythonEnvStatus('proj-abc123')
    expect(status.exists).toBe(false)
    expect(status.pythonVersion).toBeNull()
    expect(status.packageCount).toBe(0)
    expect(status.path).toBe('/data/projects/proj-abc123/runtime/python-env')
  })

  it('returns exists: true with version and package count when venv exists', async () => {
    mockAccess.mockResolvedValue(undefined)
    // First spawn: python --version
    // Second spawn: pip list --format=json
    let callCount = 0
    mockSpawn.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return createMockChild('Python 3.13.12')
      }
      return createMockChild(JSON.stringify([
        { name: 'pip', version: '24.0' },
        { name: 'numpy', version: '1.26.0' },
      ]))
    })

    const status = await getPythonEnvStatus('proj-abc123')
    expect(status.exists).toBe(true)
    expect(status.pythonVersion).toBe('3.13.12')
    expect(status.packageCount).toBe(2)
  })

  it('returns null version when python --version fails', async () => {
    mockAccess.mockResolvedValue(undefined)
    let callCount = 0
    mockSpawn.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return createMockChild('', 'error', 1)
      }
      return createMockChild('[]')
    })

    const status = await getPythonEnvStatus('proj-abc123')
    expect(status.exists).toBe(true)
    expect(status.pythonVersion).toBeNull()
  })

  it('returns packageCount 0 when pip list fails', async () => {
    mockAccess.mockResolvedValue(undefined)
    let callCount = 0
    mockSpawn.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return createMockChild('Python 3.13.12')
      }
      return createMockChild('', 'error', 1)
    })

    const status = await getPythonEnvStatus('proj-abc123')
    expect(status.exists).toBe(true)
    expect(status.packageCount).toBe(0)
  })
})
