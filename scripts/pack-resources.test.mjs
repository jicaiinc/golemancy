/**
 * Tests for pack-resources.mjs
 *
 * Validates that the script correctly creates a .tar.gz archive from
 * runtime/ and server/ directories, writes accurate metadata, and
 * generates a valid electron-builder.win.yml config.
 *
 * Prerequisites: runtime/ and server/ must exist (run download-runtime.sh
 * and bundle-server.mjs first). Tests are skipped if resources are missing.
 *
 * Run: node --test scripts/pack-resources.test.mjs
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const SCRIPT = path.join(ROOT, 'scripts/pack-resources.mjs')
const DESKTOP = path.join(ROOT, 'apps/desktop')
const RESOURCES = path.join(DESKTOP, 'resources')
const ARCHIVE = path.join(RESOURCES, 'resources-archive.tar.gz')
const META = path.join(RESOURCES, 'resources-archive.json')
const WIN_CONFIG = path.join(DESKTOP, 'electron-builder.win.yml')

const hasRuntime = fs.existsSync(path.join(RESOURCES, 'runtime'))
const hasServer = fs.existsSync(path.join(RESOURCES, 'server'))
const canRun = hasRuntime && hasServer

function runScript() {
  return execFileSync('node', [SCRIPT], {
    encoding: 'utf-8',
    timeout: 120_000,
    cwd: ROOT,
  })
}

// Clean up generated files after tests
function cleanup() {
  for (const f of [ARCHIVE, META, WIN_CONFIG]) {
    try { fs.unlinkSync(f) } catch {}
  }
}

describe('pack-resources.mjs', { skip: !canRun && 'runtime/ or server/ not found — run download-runtime.sh and bundle-server.mjs first' }, () => {
  before(() => {
    cleanup()
    runScript()
  })

  after(() => {
    cleanup()
  })

  // ── Archive ───────────────────────────────────────────────────

  it('creates resources-archive.tar.gz', () => {
    assert.ok(fs.existsSync(ARCHIVE), 'Archive file should exist')
  })

  it('archive is non-trivially sized', () => {
    const size = fs.statSync(ARCHIVE).size
    // Should be at least 10 MB (actual is ~100+ MB)
    assert.ok(size > 10 * 1024 * 1024, `Archive too small: ${Math.round(size / 1024 / 1024)} MB`)
  })

  it('archive contains runtime/ and server/ directories', () => {
    // Archive has ~20k entries — use maxBuffer to avoid ENOBUFS
    const listing = execFileSync('tar', ['tzf', ARCHIVE], {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
    })
    assert.ok(listing.includes('runtime/'), 'Should contain runtime/')
    assert.ok(listing.includes('server/'), 'Should contain server/')
  })

  // ── Metadata ──────────────────────────────────────────────────

  it('creates resources-archive.json with valid metadata', () => {
    assert.ok(fs.existsSync(META), 'Metadata file should exist')
    const meta = JSON.parse(fs.readFileSync(META, 'utf-8'))

    assert.ok(typeof meta.totalFiles === 'number', 'totalFiles should be a number')
    assert.ok(meta.totalFiles > 1000, `totalFiles too low: ${meta.totalFiles}`)
    assert.ok(typeof meta.totalBytes === 'number', 'totalBytes should be a number')
    assert.ok(meta.totalBytes > 10 * 1024 * 1024, 'totalBytes too low')
    assert.ok(typeof meta.version === 'string', 'version should be a string')
  })

  it('metadata has runtime and server breakdowns', () => {
    const meta = JSON.parse(fs.readFileSync(META, 'utf-8'))

    assert.ok(meta.runtime, 'Should have runtime breakdown')
    assert.ok(meta.runtime.files > 0, 'runtime.files should be > 0')
    assert.ok(meta.runtime.bytes > 0, 'runtime.bytes should be > 0')

    assert.ok(meta.server, 'Should have server breakdown')
    assert.ok(meta.server.files > 0, 'server.files should be > 0')
    assert.ok(meta.server.bytes > 0, 'server.bytes should be > 0')
  })

  it('metadata totalFiles equals runtime + server', () => {
    const meta = JSON.parse(fs.readFileSync(META, 'utf-8'))
    assert.equal(meta.totalFiles, meta.runtime.files + meta.server.files)
  })

  // ── Generated electron-builder config ─────────────────────────

  it('generates electron-builder.win.yml', () => {
    assert.ok(fs.existsSync(WIN_CONFIG), 'Win config should exist')
  })

  it('win config has archive in extraResources', () => {
    const config = fs.readFileSync(WIN_CONFIG, 'utf-8')
    assert.ok(config.includes('resources-archive.tar.gz'), 'Should reference archive')
    assert.ok(config.includes('resources-archive.json'), 'Should reference metadata')
  })

  it('win config does NOT have original resource directories', () => {
    const config = fs.readFileSync(WIN_CONFIG, 'utf-8')
    // The original extraResources had "from: resources/runtime" and "from: resources/server"
    // These should NOT appear in the win config
    const lines = config.split('\n')
    const extraResourceLines = []
    let inExtra = false
    for (const line of lines) {
      if (line.startsWith('extraResources:')) { inExtra = true; continue }
      if (inExtra && line.match(/^\s/)) { extraResourceLines.push(line); continue }
      if (inExtra) break
    }
    const extraBlock = extraResourceLines.join('\n')
    assert.ok(!extraBlock.includes('from: resources/runtime'), 'Should not have runtime dir in extraResources')
    assert.ok(!extraBlock.includes('from: resources/server'), 'Should not have server dir in extraResources')
  })

  it('win config preserves other settings from base config', () => {
    const config = fs.readFileSync(WIN_CONFIG, 'utf-8')
    assert.ok(config.includes('appId: ai.golemancy'), 'Should preserve appId')
    assert.ok(config.includes('productName: Golemancy'), 'Should preserve productName')
    assert.ok(config.includes('target: [nsis, msi]'), 'Should preserve win targets')
    assert.ok(config.includes('asar: true'), 'Should preserve asar setting')
  })
})
