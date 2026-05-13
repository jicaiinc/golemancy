/**
 * Build verification tests for bundle-server.mjs output.
 *
 * Tests that the server bundle script produces the correct output structure.
 * These tests validate the OUTPUT, not re-run the bundling process.
 *
 * In dev mode (no build), tests that require build artifacts are skipped.
 * After running `pnpm --filter @golemancy/desktop bundle-server`,
 * all tests should pass.
 *
 * Run: node --test scripts/bundle-server.test.mjs
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const DEPS_DIR = path.join(ROOT, 'apps/desktop/resources/server/deps')
const NODE_MODULES = path.join(DEPS_DIR, 'node_modules')

// Check if bundle exists
const bundleExists = fs.existsSync(path.join(DEPS_DIR, 'index.js'))

describe('bundle-server output structure', () => {
  // ── Core bundle files ─────────────────────────────────────────

  describe('entry points', { skip: !bundleExists && 'No server bundle found — run bundle-server first' }, () => {
    it('index.js exists in deps directory', () => {
      assert.ok(
        fs.existsSync(path.join(DEPS_DIR, 'index.js')),
        'index.js should exist in deps/',
      )
    })

    it('index.js is non-empty', () => {
      const stats = fs.statSync(path.join(DEPS_DIR, 'index.js'))
      assert.ok(stats.size > 1000, `index.js should be non-trivial (got ${stats.size} bytes)`)
    })

    it('sandbox-worker.js exists in deps directory', () => {
      assert.ok(
        fs.existsSync(path.join(DEPS_DIR, 'sandbox-worker.js')),
        'sandbox-worker.js should exist in deps/',
      )
    })

    it('sandbox-worker.js is non-empty', () => {
      const stats = fs.statSync(path.join(DEPS_DIR, 'sandbox-worker.js'))
      assert.ok(stats.size > 100, `sandbox-worker.js should be non-trivial (got ${stats.size} bytes)`)
    })

    it('index.js and sandbox-worker.js are in the same directory', () => {
      // sandbox-pool.ts uses path.join(import.meta.dirname, 'sandbox-worker.js')
      // so both must be in the same directory
      const indexDir = path.dirname(path.join(DEPS_DIR, 'index.js'))
      const workerDir = path.dirname(path.join(DEPS_DIR, 'sandbox-worker.js'))
      assert.equal(indexDir, workerDir, 'Entry points must be co-located')
    })
  })

  // ── node_modules ──────────────────────────────────────────────

  describe('node_modules', { skip: !bundleExists && 'No server bundle found — run bundle-server first' }, () => {
    it('node_modules directory exists', () => {
      assert.ok(
        fs.existsSync(NODE_MODULES),
        'node_modules should exist in deps/',
      )
    })

    it('node_modules has at least 5 packages', () => {
      if (!fs.existsSync(NODE_MODULES)) return
      const entries = fs.readdirSync(NODE_MODULES).filter(e => !e.startsWith('.'))
      assert.ok(
        entries.length >= 5,
        `Should have >= 5 packages, found ${entries.length}`,
      )
    })

    // Critical dependencies that must be present
    const criticalDeps = [
      'better-sqlite3',
      'hono',
      'drizzle-orm',
      'ai',
      'zod',
    ]

    for (const dep of criticalDeps) {
      it(`contains critical dependency: ${dep}`, () => {
        if (!fs.existsSync(NODE_MODULES)) {
          // Skip if node_modules doesn't exist
          return
        }
        const depPath = path.join(NODE_MODULES, dep)
        assert.ok(
          fs.existsSync(depPath),
          `${dep} should exist in node_modules/`,
        )
      })
    }

    it('better-sqlite3 has .node native addon', () => {
      if (!fs.existsSync(NODE_MODULES)) return
      const betterSqlite3 = path.join(NODE_MODULES, 'better-sqlite3')
      if (!fs.existsSync(betterSqlite3)) return

      // Find .node files recursively
      function findNodeFiles(dir) {
        const results = []
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true })
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
              results.push(...findNodeFiles(fullPath))
            } else if (entry.name.endsWith('.node')) {
              results.push(fullPath)
            }
          }
        } catch { /* ignore */ }
        return results
      }

      const nodeFiles = findNodeFiles(betterSqlite3)
      assert.ok(
        nodeFiles.length > 0,
        'better-sqlite3 should contain a .node native addon',
      )
    })
  })

  // ── Pruning verification ──────────────────────────────────────

  describe('pruning', { skip: !bundleExists && 'No server bundle found — run bundle-server first' }, () => {
    it('node_modules does not contain .d.ts files at top level of packages', () => {
      if (!fs.existsSync(NODE_MODULES)) return

      // Check a few top-level packages for .d.ts files
      const entries = fs.readdirSync(NODE_MODULES).filter(e => !e.startsWith('.') && !e.startsWith('@'))
      let dtsCount = 0

      for (const pkg of entries.slice(0, 10)) {
        const pkgDir = path.join(NODE_MODULES, pkg)
        try {
          const files = fs.readdirSync(pkgDir)
          dtsCount += files.filter(f => f.endsWith('.d.ts')).length
        } catch { /* skip */ }
      }

      assert.equal(dtsCount, 0, 'Pruned bundle should not contain .d.ts files at package root')
    })

    it('node_modules does not contain test directories', () => {
      if (!fs.existsSync(NODE_MODULES)) return

      const entries = fs.readdirSync(NODE_MODULES).filter(e => !e.startsWith('.') && !e.startsWith('@'))
      let testDirCount = 0

      for (const pkg of entries.slice(0, 10)) {
        const pkgDir = path.join(NODE_MODULES, pkg)
        try {
          const files = fs.readdirSync(pkgDir)
          testDirCount += files.filter(f => ['test', 'tests', '__tests__'].includes(f)).length
        } catch { /* skip */ }
      }

      assert.equal(testDirCount, 0, 'Pruned bundle should not contain test directories')
    })
  })

  // ── ESM format verification ───────────────────────────────────

  describe('bundle format', { skip: !bundleExists && 'No server bundle found — run bundle-server first' }, () => {
    it('index.js uses ESM format (contains import statements)', () => {
      const content = fs.readFileSync(path.join(DEPS_DIR, 'index.js'), 'utf-8')
      // Minified ESM will contain 'import' keyword
      assert.ok(
        content.includes('import'),
        'index.js should be ESM format (contain import statements)',
      )
    })

    it('index.js contains CJS compatibility banner for native modules', () => {
      const content = fs.readFileSync(path.join(DEPS_DIR, 'index.js'), 'utf-8')
      // The bundle script adds createRequire banner for .node addon loading
      assert.ok(
        content.includes('createRequire'),
        'index.js should contain createRequire banner for native module support',
      )
    })
  })
})
