/**
 * Node.js runtime integration tests — real node/npm detection.
 *
 * Tests getNodeRuntimeStatus with real system binaries.
 * In dev mode (no GOLEMANCY_NODE_PATH or GOLEMANCY_RESOURCES_PATH),
 * getBundledNodeBinDir returns null → status.available = false.
 *
 * To test with a real bundled node, set GOLEMANCY_NODE_PATH to
 * the path of a node binary before running these tests.
 */
import { describe, it, expect, afterAll } from 'vitest'
import path from 'node:path'
import { spawn } from 'node:child_process'

import { getNodeRuntimeStatus } from './node-manager'
import { getBundledNodeBinDir } from './paths'

// ── Helper ────────────────────────────────────────────────────

function getVersionOutput(binary: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(binary, ['--version'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    })
    let output = ''
    child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.on('close', (code) => resolve(code === 0 ? output.trim() : null))
    child.on('error', () => resolve(null))
  })
}

// ── Tests ─────────────────────────────────────────────────────

describe('Node runtime integration', () => {
  const savedNodePath = process.env.GOLEMANCY_NODE_PATH
  const savedResourcesPath = process.env.GOLEMANCY_RESOURCES_PATH

  afterAll(() => {
    // Restore env
    if (savedNodePath !== undefined) process.env.GOLEMANCY_NODE_PATH = savedNodePath
    else delete process.env.GOLEMANCY_NODE_PATH
    if (savedResourcesPath !== undefined) process.env.GOLEMANCY_RESOURCES_PATH = savedResourcesPath
    else delete process.env.GOLEMANCY_RESOURCES_PATH
  })

  describe('without bundled node (dev mode)', () => {
    it('returns available: false when no env vars set', async () => {
      delete process.env.GOLEMANCY_NODE_PATH
      delete process.env.GOLEMANCY_RESOURCES_PATH

      const status = await getNodeRuntimeStatus()

      // In dev mode, getBundledNodeBinDir() returns null
      expect(getBundledNodeBinDir()).toBeNull()
      expect(status.available).toBe(false)
      expect(status.nodeVersion).toBeNull()
      expect(status.npmVersion).toBeNull()
      expect(status.binDir).toBeNull()
    })
  })

  describe('with GOLEMANCY_NODE_PATH pointing to system node', () => {
    let systemNodePath: string | null = null

    it('detects node when GOLEMANCY_NODE_PATH is set', async () => {
      // Find system node binary
      const nodeVersion = await getVersionOutput('node')
      if (!nodeVersion) {
        // No system node available — skip
        return
      }

      // Use `which node` to get the path
      const whichResult = await new Promise<string | null>((resolve) => {
        const child = spawn('which', ['node'], {
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 5_000,
        })
        let output = ''
        child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString() })
        child.on('close', (code) => resolve(code === 0 ? output.trim() : null))
        child.on('error', () => resolve(null))
      })

      if (!whichResult) return

      systemNodePath = whichResult
      process.env.GOLEMANCY_NODE_PATH = systemNodePath

      const status = await getNodeRuntimeStatus()

      expect(status.available).toBe(true)
      expect(status.nodeVersion).toMatch(/^\d+\.\d+\.\d+$/)
      expect(status.binDir).toBe(path.dirname(systemNodePath))
    })

    it('reports npm version when available alongside node', async () => {
      if (!systemNodePath) return

      process.env.GOLEMANCY_NODE_PATH = systemNodePath
      const status = await getNodeRuntimeStatus()

      // npm might or might not be in same dir as node
      // If the system has npm in same bin dir, it should be detected
      if (status.npmVersion) {
        expect(status.npmVersion).toMatch(/^\d+\.\d+\.\d+$/)
      }
    })
  })

  describe('with invalid GOLEMANCY_NODE_PATH', () => {
    it('returns available: false for non-existent binary', async () => {
      process.env.GOLEMANCY_NODE_PATH = '/nonexistent/path/node'

      const status = await getNodeRuntimeStatus()

      expect(status.available).toBe(false)
      expect(status.nodeVersion).toBeNull()
      // binDir is still set (derived from env var), but node is not available
      expect(status.binDir).toBe('/nonexistent/path')
    })
  })
})
