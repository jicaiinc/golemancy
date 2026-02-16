/**
 * Bundle the server package for Electron packaging.
 *
 * Strategy:
 *   1. esbuild bundles ONLY our code (all dependencies are external)
 *   2. pnpm deploy copies all production dependencies automatically
 *   3. Prune unnecessary files from node_modules to reduce size
 *
 * Output: apps/desktop/resources/server/deps/
 *   - index.js           (bundled server entry)
 *   - sandbox-worker.js  (bundled sandbox worker entry)
 *   - node_modules/       (production dependencies via pnpm deploy)
 *
 * Why nested deps/ directory:
 *   electron-builder hardcodes a filter that strips top-level `node_modules/` from
 *   extraResources (matches when relative === "node_modules"). By nesting everything
 *   under deps/, the relative path becomes `deps/node_modules` which is NOT filtered.
 */

import { execSync } from 'node:child_process'
import { chmod, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

// Resolve esbuild from the desktop package where it's installed as a devDependency.
const desktopRequire = createRequire(join(ROOT, 'apps/desktop/package.json'))
const { build } = desktopRequire('esbuild')

const SERVER_PKG = join(ROOT, 'packages/server')
const OUT_DIR = join(ROOT, 'apps/desktop/resources/server')
const DEPS_DIR = join(OUT_DIR, 'deps')
const OUT_NODE_MODULES = join(DEPS_DIR, 'node_modules')
const TEMP_DEPLOY_DIR = join(ROOT, '.tmp-pnpm-deploy')

// Entry points — object format so esbuild outputs flat names (no subdirectories).
// sandbox-pool.ts does: path.join(import.meta.dirname, 'sandbox-worker.js')
// so sandbox-worker.js MUST be in the same directory as index.js.
const ENTRY_POINTS = {
  index: join(SERVER_PKG, 'src/index.ts'),
  'sandbox-worker': join(SERVER_PKG, 'src/agent/sandbox-worker.ts'),
}

// Build external list: all npm dependencies from server AND its workspace packages.
// Workspace packages (workspace:*) export raw .ts — they are bundled, not externalized.
// But their own npm dependencies must be externalized (e.g., @golemancy/tools → playwright-core).
const serverPkg = JSON.parse(
  await readFile(join(SERVER_PKG, 'package.json'), 'utf-8'),
)
const deps = serverPkg.dependencies || {}
const externalSet = new Set()
const workspacePkgs = []

for (const [name, version] of Object.entries(deps)) {
  if (version.startsWith('workspace:')) {
    workspacePkgs.push(name)
  } else {
    externalSet.add(name)
  }
}

// Also externalize dependencies of workspace packages
for (const wsPkg of workspacePkgs) {
  // workspace:* packages follow @golemancy/<name> → packages/<name>/
  const pkgDir = wsPkg.replace('@golemancy/', '')
  const wsPkgJsonPath = join(ROOT, 'packages', pkgDir, 'package.json')
  try {
    const wsPkgJson = JSON.parse(await readFile(wsPkgJsonPath, 'utf-8'))
    for (const [depName, depVersion] of Object.entries(wsPkgJson.dependencies || {})) {
      if (!depVersion.startsWith('workspace:')) {
        externalSet.add(depName)
      }
    }
  } catch {
    console.warn(`  Warning: could not read ${wsPkgJsonPath}`)
  }
}

const EXTERNALS = [...externalSet]
console.log(`Externalizing ${EXTERNALS.length} dependencies:`, EXTERNALS)

// Patterns for files/dirs to prune from node_modules
const PRUNE_FILE_PATTERNS = [
  /\.d\.ts$/,
  /\.d\.ts\.map$/,
  /\.js\.map$/,
  /\.ts$/,
  /\.mts$/,
  /\.cts$/,
  /\.md$/i,
  /tsconfig\.json$/,
  /\.eslintrc/,
  /\.prettierrc/,
  /\.editorconfig$/,
]

const PRUNE_DIR_NAMES = new Set([
  'test',
  'tests',
  '__tests__',
  'docs',
  'doc',
  'example',
  'examples',
])

/**
 * Recursively prune unnecessary files from a directory.
 * Returns the count of removed items.
 */
async function pruneDir(dirPath) {
  let removed = 0
  let entries
  try {
    entries = await readdir(dirPath, { withFileTypes: true })
  } catch {
    return 0
  }

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)

    if (entry.isDirectory()) {
      if (PRUNE_DIR_NAMES.has(entry.name)) {
        await rm(fullPath, { recursive: true, force: true })
        removed++
      } else {
        removed += await pruneDir(fullPath)
      }
    } else if (entry.isFile()) {
      const shouldPrune = PRUNE_FILE_PATTERNS.some((p) => p.test(entry.name))
      if (shouldPrune) {
        await rm(fullPath, { force: true })
        removed++
      }
    }
  }

  return removed
}

/**
 * Recursively find and preserve executable permissions on binary files.
 * (.node native addons, rg binary, etc.)
 */
async function preserveBinaryPermissions(dirPath) {
  let entries
  try {
    entries = await readdir(dirPath, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)

    if (entry.isDirectory()) {
      // Check bin/ directories and .node files anywhere
      await preserveBinaryPermissions(fullPath)
    } else if (entry.isFile()) {
      // Ensure native addons and known binaries are executable
      if (
        entry.name.endsWith('.node') ||
        entry.name === 'rg' ||
        entry.name === 'apply-seccomp'
      ) {
        try {
          const fileStat = await stat(fullPath)
          // If file is not executable, make it so
          if (!(fileStat.mode & 0o111)) {
            await chmod(fullPath, fileStat.mode | 0o755)
            console.log(`  Fixed permissions: ${fullPath}`)
          }
        } catch {
          // Ignore permission errors
        }
      }
    }
  }
}

async function bundleServer() {
  console.log('Bundling server...')

  // 1. Clean output directory
  await rm(OUT_DIR, { recursive: true, force: true })
  await mkdir(DEPS_DIR, { recursive: true })

  // 2. esbuild: bundle our code with all dependencies external
  console.log('\n[1/4] esbuild: bundling source code...')
  const result = await build({
    entryPoints: ENTRY_POINTS,
    outdir: DEPS_DIR,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    minify: true,
    banner: {
      // Create a CJS-compatible require() for native modules (better-sqlite3)
      // that use require() internally for .node addon loading.
      // Use __cjsRequire to avoid naming conflicts.
      js: "import{createRequire as __cjsRequire}from'module';const require=__cjsRequire(import.meta.url);",
    },
    external: EXTERNALS,
    logLevel: 'warning',
  })

  if (result.errors.length > 0) {
    console.error('Build failed:', result.errors)
    process.exit(1)
  }

  console.log(`  Bundled ${Object.keys(ENTRY_POINTS).length} entry points → ${DEPS_DIR}`)

  // 3. pnpm deploy: copy production dependencies
  console.log('\n[2/4] pnpm deploy: copying production dependencies...')
  await rm(TEMP_DEPLOY_DIR, { recursive: true, force: true })

  try {
    execSync(
      `pnpm deploy --prod --legacy --filter @golemancy/server "${TEMP_DEPLOY_DIR}"`,
      {
        cwd: ROOT,
        stdio: 'pipe',
        encoding: 'utf-8',
      },
    )
  } catch (err) {
    console.error('pnpm deploy failed:', err.stderr || err.message)
    process.exit(1)
  }

  // Copy node_modules from the deploy output.
  // pnpm deploy creates a symlink-based structure:
  //   node_modules/hono → .pnpm/hono@4.x/node_modules/hono (symlink)
  //   node_modules/.pnpm/...                               (real files)
  // Some transitive deps (like playwright-core from @golemancy/tools) only
  // exist in .pnpm/ without a top-level symlink.
  //
  // Strategy:
  //   1. cp -rL top-level entries (skip .pnpm/) → dereferences symlinks to real files
  //   2. Hoist any EXTERNALS missing from top-level by finding them in .pnpm/
  //   3. Don't copy .pnpm/ at all (avoids 400MB+ of duplicates)
  const deployedNodeModules = join(TEMP_DEPLOY_DIR, 'node_modules')
  await mkdir(OUT_NODE_MODULES, { recursive: true })

  // Step 1: Copy top-level packages (skip .pnpm/)
  const topLevelEntries = await readdir(deployedNodeModules)
  for (const entry of topLevelEntries) {
    if (entry === '.pnpm' || entry === '.modules.yaml' || entry === '.package-lock.json') continue
    const src = join(deployedNodeModules, entry)
    const dest = join(OUT_NODE_MODULES, entry)
    execSync(`cp -rL "${src}" "${dest}"`, { stdio: 'pipe' })
  }
  console.log(`  Copied ${topLevelEntries.filter(e => e !== '.pnpm' && !e.startsWith('.')).length} top-level packages`)

  // Step 2: Hoist ALL packages from .pnpm/ to create flat node_modules
  //
  // pnpm deploy creates a symlink-based structure where transitive deps
  // (e.g., 'defu' needed by hono-pino) only exist inside .pnpm/ without
  // top-level symlinks. We must hoist every package for flat resolution.
  //
  // .pnpm/ entry format: "pkg@version" or "@scope+name@version[_peers]"
  // Real files live at: .pnpm/{entry}/node_modules/{pkgName}/
  const pnpmDir = join(deployedNodeModules, '.pnpm')
  let pnpmEntries = []
  try { pnpmEntries = await readdir(pnpmDir) } catch { /* no .pnpm */ }

  let hoistedCount = 0
  for (const entry of pnpmEntries) {
    if (entry.startsWith('.') || entry === 'lock.yaml') continue

    // Parse package name from .pnpm entry name
    let pkgName
    if (entry.startsWith('@')) {
      // Scoped: "@scope+name@version[_peers]" → "@scope/name"
      const atIdx = entry.indexOf('@', 1)
      if (atIdx === -1) continue
      pkgName = entry.substring(0, atIdx).replace('+', '/')
    } else {
      // Non-scoped: "name@version[_peers]" → "name"
      const atIdx = entry.indexOf('@')
      if (atIdx === -1) continue
      pkgName = entry.substring(0, atIdx)
    }

    if (!pkgName) continue

    // Check if already exists at top level
    const parts = pkgName.split('/')
    const topLevelPath = join(OUT_NODE_MODULES, ...parts)
    try { await stat(topLevelPath); continue } catch { /* missing, hoist it */ }

    // Copy real files from .pnpm/{entry}/node_modules/{pkgName}/
    const src = join(pnpmDir, entry, 'node_modules', ...parts)
    try {
      await stat(src)
      if (parts.length > 1) {
        await mkdir(join(OUT_NODE_MODULES, parts[0]), { recursive: true })
      }
      execSync(`cp -rL "${src}" "${topLevelPath}"`, { stdio: 'pipe' })
      hoistedCount++
    } catch {
      // Package structure doesn't match expectation, skip
    }
  }
  console.log(`  Hoisted ${hoistedCount} transitive dependencies from .pnpm/`)

  // Clean up temp directory
  await rm(TEMP_DEPLOY_DIR, { recursive: true, force: true })
  console.log('  Cleaned up temp deploy directory')

  // 4. Prune unnecessary files from node_modules
  console.log('\n[3/4] Pruning unnecessary files from node_modules...')
  const removedCount = await pruneDir(OUT_NODE_MODULES)
  console.log(`  Removed ${removedCount} unnecessary files/directories`)

  // 5. Fix binary permissions
  console.log('\n[4/4] Fixing binary permissions...')
  await preserveBinaryPermissions(OUT_NODE_MODULES)

  console.log('\nServer bundle complete.')
}

bundleServer().catch((err) => {
  console.error(err)
  process.exit(1)
})
