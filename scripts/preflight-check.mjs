/**
 * Preflight check before electron-builder packaging.
 *
 * Validates that ALL required artifacts exist and are correct:
 *   1. Bundled runtimes (Node.js + Python) from download-runtime.sh
 *   2. Server bundle from bundle-server.mjs
 *   3. Electron-vite build output (main + preload + renderer)
 *   4. Build resources (icons, entitlements)
 *
 * Fails with clear, actionable error messages listing every issue found.
 * Must pass before electron-builder runs — prevents silent packaging of
 * empty/missing directories.
 */

import { access, constants, readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const DESKTOP = join(ROOT, 'apps/desktop')

const errors = []

async function checkFile(filePath, description, fix) {
  try {
    await access(filePath, constants.F_OK)
  } catch {
    errors.push({ description, path: filePath, fix })
  }
}

async function checkExecutable(filePath, description, fix) {
  try {
    const s = await stat(filePath)
    if (!(s.mode & 0o111)) {
      errors.push({ description: `${description} (exists but not executable)`, path: filePath, fix })
    }
  } catch {
    errors.push({ description, path: filePath, fix })
  }
}

async function checkDirMinSize(dirPath, description, minEntries, fix) {
  try {
    const entries = await readdir(dirPath)
    if (entries.length < minEntries) {
      errors.push({
        description: `${description} (found ${entries.length} entries, expected >= ${minEntries})`,
        path: dirPath,
        fix,
      })
    }
  } catch {
    errors.push({ description, path: dirPath, fix })
  }
}

// ── Target platform detection ───────────────────────────────
// Accepts --target mac|linux|win from CLI. Defaults to current platform.

const TARGET_MAP = { mac: 'darwin', linux: 'linux', win: 'win32' }
const PLATFORM_LABELS = { darwin: 'macOS', linux: 'Linux', win32: 'Windows' }

function resolveTargetPlatform() {
  const idx = process.argv.indexOf('--target')
  if (idx !== -1 && process.argv[idx + 1]) {
    const target = process.argv[idx + 1]
    const mapped = TARGET_MAP[target]
    if (!mapped) {
      console.error(`Unknown --target value: "${target}". Expected: mac, linux, or win.`)
      process.exit(1)
    }
    return mapped
  }
  return process.platform
}

async function main() {
  const targetPlatform = resolveTargetPlatform()

  console.log(`Preflight check: validating packaging prerequisites (target: ${PLATFORM_LABELS[targetPlatform] || targetPlatform})...\n`)

  // ── 0. Cross-platform build guard ──────────────────────────
  // Runtime binaries and native modules are platform-specific.
  // Building for a different platform than the host will produce a broken package.

  if (targetPlatform !== process.platform) {
    errors.push({
      description: `Cannot build for ${PLATFORM_LABELS[targetPlatform] || targetPlatform} on ${PLATFORM_LABELS[process.platform] || process.platform}`,
      path: '(cross-platform build)',
      fix: `Run 'dist:${Object.entries(TARGET_MAP).find(([, v]) => v === targetPlatform)?.[0]}' on a ${PLATFORM_LABELS[targetPlatform]} machine or CI runner instead`,
    })
  }

  const runtimeDir = join(DESKTOP, 'resources/runtime')
  const serverDeps = join(DESKTOP, 'resources/server/deps')
  const outDir = join(DESKTOP, 'out')

  // ── 1. Bundled runtimes ─────────────────────────────────────
  // Windows: executables at root (node.exe, python.exe); Unix: in bin/ subdirectory.

  const isWin = process.platform === 'win32'
  const runtimeFix = "Run 'pnpm --filter @golemancy/desktop download-runtime' to download"

  if (isWin) {
    await checkFile(
      join(runtimeDir, 'node/node.exe'),
      'Bundled Node.js runtime',
      runtimeFix,
    )
    await checkFile(
      join(runtimeDir, 'python/python.exe'),
      'Bundled Python runtime',
      runtimeFix,
    )
  } else {
    await checkExecutable(
      join(runtimeDir, 'node/bin/node'),
      'Bundled Node.js runtime',
      runtimeFix,
    )
    await checkExecutable(
      join(runtimeDir, 'python/bin/python3.13'),
      'Bundled Python runtime',
      runtimeFix,
    )
  }

  // ── 2. Server bundle ───────────────────────────────────────

  await checkFile(
    join(serverDeps, 'index.js'),
    'Server entry bundle (index.js)',
    "Run 'pnpm --filter @golemancy/desktop bundle-server' to generate",
  )

  await checkFile(
    join(serverDeps, 'sandbox-worker.js'),
    'Sandbox worker bundle (sandbox-worker.js)',
    "Run 'pnpm --filter @golemancy/desktop bundle-server' to generate",
  )

  await checkFile(
    join(serverDeps, 'node_modules/better-sqlite3/package.json'),
    'Native: better-sqlite3',
    "Run 'pnpm --filter @golemancy/desktop bundle-server' to generate",
  )

  await checkFile(
    join(serverDeps, 'node_modules/@vscode/ripgrep/package.json'),
    'Native: @vscode/ripgrep',
    "Run 'pnpm --filter @golemancy/desktop bundle-server' to generate",
  )

  await checkFile(
    join(serverDeps, 'node_modules/agent-browser/package.json'),
    'Native: agent-browser',
    "Run 'pnpm --filter @golemancy/desktop bundle-server' to generate",
  )

  // Verify deps/package.json has "type": "module" (required for ESM bundle)
  try {
    const depsPackageJson = JSON.parse(await readFile(join(serverDeps, 'package.json'), 'utf-8'))
    if (depsPackageJson.type !== 'module') {
      errors.push({
        description: 'Server deps package.json missing "type": "module" (ESM bundle will fail)',
        path: join(serverDeps, 'package.json'),
        fix: "Run 'pnpm --filter @golemancy/desktop bundle-server' to regenerate",
      })
    }
  } catch {
    errors.push({
      description: 'Server deps package.json not found',
      path: join(serverDeps, 'package.json'),
      fix: "Run 'pnpm --filter @golemancy/desktop bundle-server' to generate",
    })
  }

  // ── 3. Electron-vite build output ──────────────────────────

  await checkFile(
    join(outDir, 'main/index.js'),
    'Electron main process bundle',
    "Run 'pnpm --filter @golemancy/desktop build' (electron-vite build) to generate",
  )

  await checkFile(
    join(outDir, 'preload/index.mjs'),
    'Electron preload script',
    "Run 'pnpm --filter @golemancy/desktop build' (electron-vite build) to generate",
  )

  await checkFile(
    join(outDir, 'renderer/index.html'),
    'Renderer HTML entry',
    "Run 'pnpm --filter @golemancy/desktop build' (electron-vite build) to generate",
  )

  // ── 4. Build resources ─────────────────────────────────────

  if (process.platform === 'darwin') {
    await checkFile(
      join(DESKTOP, 'resources/build/entitlements.mac.plist'),
      'macOS entitlements plist',
    )
  }

  // ── Report ─────────────────────────────────────────────────

  if (errors.length > 0) {
    console.error(`Preflight check FAILED \u2014 ${errors.length} issue(s) found:\n`)
    for (const err of errors) {
      console.error(`  \u2717 ${err.description}`)
      console.error(`    Path: ${err.path}`)
      if (err.fix) {
        console.error(`    Fix:  ${err.fix}`)
      }
      console.error()
    }
    console.error('Packaging cannot proceed until all issues are resolved.')
    process.exit(1)
  }

  console.log('Preflight check passed \u2014 all prerequisites verified.\n')
}

main()
