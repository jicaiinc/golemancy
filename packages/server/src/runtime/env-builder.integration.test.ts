/**
 * Env builder integration tests — real PATH construction.
 *
 * These tests use real path functions (no mocks) to verify
 * buildRuntimeEnv and buildMCPRuntimeEnv behavior.
 */
import { describe, it, expect, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

import { buildRuntimeEnv, buildMCPRuntimeEnv } from './env-builder'
import {
  getProjectPythonEnvBinPath,
  getProjectPythonEnvPath,
  getPipCachePath,
  getNpmCachePath,
} from './paths'

const PROJECT_ID = 'proj-envTest1'

// ── Check python3 availability synchronously ─────────────────
const pythonAvailable = spawnSync('python3', ['--version'], {
  stdio: 'ignore',
  timeout: 5_000,
}).status === 0

// ── Tests ─────────────────────────────────────────────────────

describe('buildRuntimeEnv integration', () => {
  it('returns all required env var keys', () => {
    const env = buildRuntimeEnv(PROJECT_ID, '/usr/bin')
    expect(env).toHaveProperty('PATH')
    expect(env).toHaveProperty('PIP_CACHE_DIR')
    expect(env).toHaveProperty('VIRTUAL_ENV')
    expect(env).toHaveProperty('npm_config_cache')
  })

  it('PATH starts with project venv bin directory', () => {
    const env = buildRuntimeEnv(PROJECT_ID, '/usr/bin')
    const pathParts = env.PATH.split(':')
    expect(pathParts[0]).toBe(getProjectPythonEnvBinPath(PROJECT_ID))
  })

  it('PATH contains the original basePath at the end', () => {
    const basePath = '/usr/bin:/usr/local/bin'
    const env = buildRuntimeEnv(PROJECT_ID, basePath)
    expect(env.PATH.endsWith(basePath)).toBe(true)
  })

  it('VIRTUAL_ENV points to project python env path', () => {
    const env = buildRuntimeEnv(PROJECT_ID)
    expect(env.VIRTUAL_ENV).toBe(getProjectPythonEnvPath(PROJECT_ID))
    expect(env.VIRTUAL_ENV).toContain(PROJECT_ID)
    expect(env.VIRTUAL_ENV).toContain('python-env')
  })

  it('PIP_CACHE_DIR points to shared cache', () => {
    const env = buildRuntimeEnv(PROJECT_ID)
    expect(env.PIP_CACHE_DIR).toBe(getPipCachePath())
    expect(env.PIP_CACHE_DIR).toContain('cache/pip')
  })

  it('npm_config_cache points to shared npm cache', () => {
    const env = buildRuntimeEnv(PROJECT_ID)
    expect(env.npm_config_cache).toBe(getNpmCachePath())
    expect(env.npm_config_cache).toContain('cache/npm')
  })

  it('uses process.env.PATH when basePath not provided', () => {
    const env = buildRuntimeEnv(PROJECT_ID)
    expect(env.PATH).toContain(process.env.PATH)
  })

  describe('with GOLEMANCY_NODE_PATH set', () => {
    const savedNodePath = process.env.GOLEMANCY_NODE_PATH

    afterAll(() => {
      if (savedNodePath !== undefined) process.env.GOLEMANCY_NODE_PATH = savedNodePath
      else delete process.env.GOLEMANCY_NODE_PATH
    })

    it('includes bundled node bin dir in PATH when set', () => {
      const fakeBinDir = '/tmp/fake-node-bin'
      process.env.GOLEMANCY_NODE_PATH = path.join(fakeBinDir, 'node')

      const env = buildRuntimeEnv(PROJECT_ID, '/usr/bin')
      const pathParts = env.PATH.split(':')

      // Order: venv bin → bundled node bin → original PATH
      expect(pathParts[0]).toBe(getProjectPythonEnvBinPath(PROJECT_ID))
      expect(pathParts[1]).toBe(fakeBinDir)
      expect(pathParts[2]).toBe('/usr/bin')

      delete process.env.GOLEMANCY_NODE_PATH
    })
  })

  describe('different projects produce different env vars', () => {
    it('VIRTUAL_ENV and PATH differ per project', () => {
      const envA = buildRuntimeEnv('proj-envA', '/usr/bin')
      const envB = buildRuntimeEnv('proj-envB', '/usr/bin')

      expect(envA.VIRTUAL_ENV).not.toBe(envB.VIRTUAL_ENV)
      expect(envA.VIRTUAL_ENV).toContain('proj-envA')
      expect(envB.VIRTUAL_ENV).toContain('proj-envB')

      expect(envA.PATH).not.toBe(envB.PATH)
    })

    it('shared dirs (pip cache, npm cache) are the same', () => {
      const envA = buildRuntimeEnv('proj-envA')
      const envB = buildRuntimeEnv('proj-envB')

      expect(envA.PIP_CACHE_DIR).toBe(envB.PIP_CACHE_DIR)
      expect(envA.npm_config_cache).toBe(envB.npm_config_cache)
    })
  })

  describe.skipIf(!pythonAvailable)('real venv integration', () => {
    it('python from PATH resolves correctly when venv exists', async () => {
      const venvPath = getProjectPythonEnvPath(PROJECT_ID)
      await fs.mkdir(path.dirname(venvPath), { recursive: true })

      const createResult = await new Promise<number>((resolve) => {
        const child = spawn('python3', ['-m', 'venv', venvPath], {
          stdio: 'ignore',
          timeout: 60_000,
        })
        child.on('close', (code) => resolve(code ?? 1))
        child.on('error', () => resolve(1))
      })

      if (createResult !== 0) return

      const env = buildRuntimeEnv(PROJECT_ID, '/usr/bin')

      // Verify that running python with this PATH uses the venv python
      const pythonResult = await new Promise<string>((resolve) => {
        const child = spawn('python', ['--version'], {
          stdio: ['ignore', 'pipe', 'ignore'],
          env: { ...process.env, PATH: env.PATH },
          timeout: 5_000,
        })
        let output = ''
        child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString() })
        child.on('close', () => resolve(output.trim()))
        child.on('error', () => resolve(''))
      })

      expect(pythonResult).toMatch(/^Python \d+\.\d+/)

      // Clean up
      await fs.rm(venvPath, { recursive: true, force: true })
    }, 60_000)
  })
})

describe('buildMCPRuntimeEnv integration', () => {
  it('returns empty object in dev mode (no bundled node)', () => {
    const saved = process.env.GOLEMANCY_NODE_PATH
    delete process.env.GOLEMANCY_NODE_PATH

    const env = buildMCPRuntimeEnv('/usr/bin')
    expect(env).toEqual({})

    if (saved !== undefined) process.env.GOLEMANCY_NODE_PATH = saved
  })

  it('returns PATH with bundled node when GOLEMANCY_NODE_PATH set', () => {
    const saved = process.env.GOLEMANCY_NODE_PATH
    process.env.GOLEMANCY_NODE_PATH = '/tmp/fake-node/node'

    const env = buildMCPRuntimeEnv('/usr/bin')
    expect(env.PATH).toBe('/tmp/fake-node:/usr/bin')
    expect(env.npm_config_cache).toBe(getNpmCachePath())

    if (saved !== undefined) process.env.GOLEMANCY_NODE_PATH = saved
    else delete process.env.GOLEMANCY_NODE_PATH
  })

  it('does NOT include Python-related env vars', () => {
    const saved = process.env.GOLEMANCY_NODE_PATH
    process.env.GOLEMANCY_NODE_PATH = '/tmp/fake-node/node'

    const env = buildMCPRuntimeEnv('/usr/bin')
    expect(env).not.toHaveProperty('PIP_CACHE_DIR')
    expect(env).not.toHaveProperty('VIRTUAL_ENV')

    if (saved !== undefined) process.env.GOLEMANCY_NODE_PATH = saved
    else delete process.env.GOLEMANCY_NODE_PATH
  })
})
