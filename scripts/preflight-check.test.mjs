/**
 * Build verification tests for preflight-check.mjs
 *
 * Tests that the preflight check script correctly validates
 * packaging prerequisites and reports clear errors for missing artifacts.
 *
 * Run: node --test scripts/preflight-check.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execSync, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const ROOT = path.resolve(import.meta.dirname, '..')
const PREFLIGHT_SCRIPT = path.join(ROOT, 'scripts/preflight-check.mjs')
const DESKTOP = path.join(ROOT, 'apps/desktop')

/**
 * Run the preflight check script and return { status, stdout, stderr }.
 * Does NOT throw on non-zero exit.
 */
function runPreflight(args = []) {
  try {
    const stdout = execFileSync('node', [PREFLIGHT_SCRIPT, ...args], {
      encoding: 'utf-8',
      timeout: 15_000,
      cwd: ROOT,
    })
    return { status: 0, stdout, stderr: '' }
  } catch (err) {
    return {
      status: err.status ?? 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
    }
  }
}

describe('preflight-check.mjs', () => {
  // ── Error detection tests ─────────────────────────────────────
  // These tests verify that the script fails with clear errors
  // when required artifacts are missing. Since we're running in a
  // dev environment (no build artifacts), the script SHOULD fail.

  it('exits with non-zero when build artifacts are missing', () => {
    const result = runPreflight()

    // In dev mode, most build artifacts don't exist
    // The script should fail (unless a full build was just run)
    const hasRuntimeDir = fs.existsSync(
      path.join(DESKTOP, 'resources/runtime/node/bin/node'),
    )
    const hasServerBundle = fs.existsSync(
      path.join(DESKTOP, 'resources/server/deps/index.js'),
    )
    const hasElectronBuild = fs.existsSync(
      path.join(DESKTOP, 'out/main/index.js'),
    )

    if (!hasRuntimeDir || !hasServerBundle || !hasElectronBuild) {
      // At least one artifact is missing, so script should fail
      assert.notEqual(result.status, 0, 'Should fail when artifacts are missing')
      assert.ok(
        result.stderr.includes('FAILED') || result.stdout.includes('FAILED'),
        'Should output FAILED message',
      )
    }
    // If all exist (post-build), status 0 is correct — test still passes
  })

  it('reports missing runtime with clear error message', () => {
    const nodeRuntime = path.join(
      DESKTOP,
      'resources/runtime/node/bin/node',
    )
    if (fs.existsSync(nodeRuntime)) {
      // Runtime exists (post-download), skip this test
      return
    }

    const result = runPreflight()
    const output = result.stdout + result.stderr

    assert.ok(
      output.includes('Bundled Node.js runtime') || output.includes('runtime'),
      'Should mention missing Node.js runtime',
    )
    assert.ok(
      output.includes('download-runtime'),
      'Should suggest running download-runtime to fix',
    )
  })

  it('reports missing server bundle with clear error message', () => {
    const serverEntry = path.join(
      DESKTOP,
      'resources/server/deps/index.js',
    )
    if (fs.existsSync(serverEntry)) {
      return
    }

    const result = runPreflight()
    const output = result.stdout + result.stderr

    assert.ok(
      output.includes('Server entry bundle') || output.includes('index.js'),
      'Should mention missing server bundle',
    )
    assert.ok(
      output.includes('bundle-server'),
      'Should suggest running bundle-server to fix',
    )
  })

  it('reports missing electron-vite output with clear error message', () => {
    const mainEntry = path.join(DESKTOP, 'out/main/index.js')
    if (fs.existsSync(mainEntry)) {
      return
    }

    const result = runPreflight()
    const output = result.stdout + result.stderr

    assert.ok(
      output.includes('Electron main process') || output.includes('electron-vite'),
      'Should mention missing electron-vite output',
    )
  })

  it('reports sandbox-worker.js as required', () => {
    const sandboxWorker = path.join(
      DESKTOP,
      'resources/server/deps/sandbox-worker.js',
    )
    if (fs.existsSync(sandboxWorker)) {
      return
    }

    const result = runPreflight()
    const output = result.stdout + result.stderr

    assert.ok(
      output.includes('sandbox-worker') || output.includes('Sandbox worker'),
      'Should mention missing sandbox-worker.js',
    )
  })

  // ── Cross-platform guard ──────────────────────────────────────

  it('rejects cross-platform build targets', () => {
    // Pick a target that differs from current platform
    const currentPlatform = process.platform
    const otherTarget = currentPlatform === 'darwin' ? 'linux' : 'mac'

    const result = runPreflight(['--target', otherTarget])
    const output = result.stdout + result.stderr

    assert.notEqual(result.status, 0, 'Should fail for cross-platform target')
    assert.ok(
      output.includes('Cannot build for') || output.includes('FAILED'),
      'Should mention cross-platform build restriction',
    )
  })

  it('rejects unknown --target values', () => {
    const result = runPreflight(['--target', 'invalid-os'])

    assert.notEqual(result.status, 0, 'Should fail for unknown target')
    const output = result.stdout + result.stderr
    assert.ok(
      output.includes('Unknown --target'),
      'Should report unknown target value',
    )
  })

  // ── Counts all errors ─────────────────────────────────────────

  it('reports count of all issues found', () => {
    const result = runPreflight()

    if (result.status !== 0) {
      const output = result.stdout + result.stderr
      assert.ok(
        output.includes('issue(s) found'),
        'Should report total issue count',
      )
    }
    // If status is 0, all artifacts exist — that's fine too
  })
})
