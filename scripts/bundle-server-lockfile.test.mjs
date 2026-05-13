import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import {
  buildStandaloneLockfile,
  collectLockedDependencies,
  collectExternalImportsFromMetafile,
  collectExternalPackagesToVerify,
  parsePnpmLockfileImporters,
} from './bundle-server.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const ROOT_LOCKFILE = fs.readFileSync(path.join(ROOT, 'pnpm-lock.yaml'), 'utf-8')
const ROOT_PACKAGE_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'))

describe('bundle-server lockfile helpers', () => {
  it('parses locked direct dependencies from workspace importers', () => {
    const importers = parsePnpmLockfileImporters(ROOT_LOCKFILE)
    const serverDeps = importers.get('packages/server')?.dependencies
    const toolsDeps = importers.get('packages/tools')?.dependencies

    assert.ok(serverDeps, 'packages/server importer should exist')
    assert.ok(toolsDeps, 'packages/tools importer should exist')
    assert.deepEqual(serverDeps.get('just-bash'), {
      specifier: '^2.9.8',
      version: '2.9.8',
    })
    assert.deepEqual(toolsDeps.get('agent-browser'), {
      specifier: '0.14.0',
      version: '0.14.0',
    })
  })

  it('builds a standalone lockfile with only the requested direct deps', () => {
    const lockfile = buildStandaloneLockfile(ROOT_LOCKFILE, new Map([
      ['better-sqlite3', 'packages/server'],
      ['just-bash', 'packages/server'],
      ['agent-browser', 'packages/tools'],
    ]))

    assert.match(lockfile, /^lockfileVersion: '9\.0'/m)
    assert.match(lockfile, /^importers:\n\n  \.:\n    dependencies:/m)
    assert.match(lockfile, /'just-bash':\n        specifier: '\^2\.9\.8'\n        version: '2\.9\.8'/m)
    assert.match(lockfile, /'agent-browser':\n        specifier: '0\.14\.0'\n        version: '0\.14\.0'/m)
    assert.doesNotMatch(lockfile, /^  packages\/server:$/m)
    assert.match(lockfile, /^packages:$/m)
    assert.match(lockfile, /^snapshots:$/m)
  })

  it('accepts CRLF pnpm lockfiles from Windows checkouts', () => {
    const crlfLockfile = ROOT_LOCKFILE.replace(/\n/g, '\r\n')
    const lockfile = buildStandaloneLockfile(crlfLockfile, new Map([
      ['better-sqlite3', 'packages/server'],
      ['just-bash', 'packages/server'],
      ['agent-browser', 'packages/tools'],
    ]))

    assert.match(lockfile, /^lockfileVersion: '9\.0'/m)
    assert.match(lockfile, /^importers:\n\n  \.:\n    dependencies:/m)
    assert.match(lockfile, /^packages:$/m)
    assert.match(lockfile, /^snapshots:$/m)
  })

  it('supports frozen offline install with the generated standalone lockfile', () => {
    const dependencySources = new Map([
      ['agent-browser', 'packages/tools'],
      ['better-sqlite3', 'packages/server'],
      ['just-bash', 'packages/server'],
    ])
    const lockedDependencies = collectLockedDependencies(ROOT_LOCKFILE, dependencySources)
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'golemancy-bundle-lockfile-'))

    try {
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          name: 'golemancy-bundle-lockfile-test',
          private: true,
          packageManager: ROOT_PACKAGE_JSON.packageManager,
          dependencies: Object.fromEntries(
            lockedDependencies.map(dep => [dep.name, dep.specifier]),
          ),
        }, null, 2) + '\n',
      )
      fs.writeFileSync(path.join(tempDir, '.npmrc'), 'node-linker=hoisted\nsymlink=false\n')
      fs.writeFileSync(
        path.join(tempDir, 'pnpm-lock.yaml'),
        buildStandaloneLockfile(ROOT_LOCKFILE, dependencySources),
      )

      execFileSync('pnpm', ['install', '--prod', '--ignore-scripts', '--frozen-lockfile', '--offline'], {
        cwd: tempDir,
        stdio: 'pipe',
        encoding: 'utf-8',
      })

      const justBashPkg = JSON.parse(fs.readFileSync(path.join(tempDir, 'node_modules', 'just-bash', 'package.json'), 'utf-8'))
      const fastXmlParserPkg = JSON.parse(fs.readFileSync(path.join(tempDir, 'node_modules', 'fast-xml-parser', 'package.json'), 'utf-8'))

      assert.equal(justBashPkg.version, '2.9.8')
      assert.equal(fastXmlParserPkg.version, '5.3.5')
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('collects only real external packages from the esbuild metafile', () => {
    const externalPkgs = collectExternalImportsFromMetafile({
      outputs: {
        'apps/desktop/resources/server/deps/index.js': {
          imports: [
            { path: 'better-sqlite3', external: true },
            { path: '@scope/pkg/subpath', external: true },
            { path: 'node:fs', external: true },
            { path: './chunk.js', external: false },
            { path: 'docx', external: false },
          ],
        },
        'apps/desktop/resources/server/deps/sandbox-worker.js': {
          imports: [
            { path: 'better-sqlite3', external: true },
          ],
        },
      },
    })

    assert.deepEqual(externalPkgs, ['@scope/pkg', 'better-sqlite3', 'node:fs'])
  })

  it('verifies only packages we intentionally externalized', () => {
    const pkgsToVerify = collectExternalPackagesToVerify({
      outputs: {
        'apps/desktop/resources/server/deps/index.js': {
          imports: [
            { path: 'better-sqlite3', external: true },
            { path: 'bufferutil', external: true },
            { path: 'utf-8-validate', external: true },
            { path: 'agent-browser/dist/browser.js', external: true },
          ],
        },
      },
    }, ['better-sqlite3', 'agent-browser'])

    assert.deepEqual(pkgsToVerify, ['agent-browser', 'better-sqlite3'])
  })
})
