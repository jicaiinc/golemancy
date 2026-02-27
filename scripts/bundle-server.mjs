/**
 * Bundle the server package for Electron packaging.
 *
 * Strategy:
 *   1. esbuild bundles ONLY our code (all dependencies are external)
 *   2. pnpm deploy + copy top-level + targeted hoist (fills missing externals from .pnpm/)
 *   3. Isolated subprocess verification (import() in /tmp/ with symlinked node_modules)
 *   4. Prune unnecessary files from node_modules to reduce size
 *   5. Fix binary permissions
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

import { execSync, execFileSync } from 'node:child_process'
import { chmod, cp, mkdir, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
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
//
// BUNDLE_INLINE: Pure-JS packages that should be bundled into the output rather than
// kept external. This avoids ESM/CJS interop issues at runtime (e.g., brace-expansion
// being CJS but imported via ESM named exports by minimatch on Windows).
// If the build-time verification step fails for a package, add it here.
const BUNDLE_INLINE = new Set([
  'minimatch',
  'brace-expansion',
  'balanced-match',
])

const serverPkg = JSON.parse(
  await readFile(join(SERVER_PKG, 'package.json'), 'utf-8'),
)
const deps = serverPkg.dependencies || {}
const externalSet = new Set()
const workspacePkgs = []

for (const [name, version] of Object.entries(deps)) {
  if (version.startsWith('workspace:')) {
    workspacePkgs.push(name)
  } else if (!BUNDLE_INLINE.has(name)) {
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
      if (!depVersion.startsWith('workspace:') && !BUNDLE_INLINE.has(depName)) {
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
  console.log('\n[1/5] esbuild: bundling source code...')
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
  console.log('\n[2/5] pnpm deploy: copying production dependencies...')
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
  //
  // Strategy:
  //   1. cp -rL top-level entries (skip .pnpm/) → dereferences symlinks to real files
  //      pnpm deploy's top-level symlinks point to the correct versions,
  //      so dereference gives us exactly the right version.
  //   2. Don't copy .pnpm/ at all (avoids 400MB+ of duplicates)
  //   3. Verify all external imports can resolve from the result
  const deployedNodeModules = join(TEMP_DEPLOY_DIR, 'node_modules')
  await mkdir(OUT_NODE_MODULES, { recursive: true })

  // Step 1: Copy top-level packages (skip .pnpm/)
  // Uses fs.cp with dereference:true to follow symlinks (equivalent to cp -rL).
  const topLevelEntries = await readdir(deployedNodeModules)
  for (const entry of topLevelEntries) {
    if (entry === '.pnpm' || entry === '.modules.yaml' || entry === '.package-lock.json') continue
    const src = join(deployedNodeModules, entry)
    const dest = join(OUT_NODE_MODULES, entry)
    await cp(src, dest, { recursive: true, dereference: true })
  }
  console.log(`  Copied ${topLevelEntries.filter(e => e !== '.pnpm' && !e.startsWith('.')).length} top-level packages`)

  // Step 2: Targeted hoist — find externals missing from top-level and copy from .pnpm/
  // Unlike brute-force hoisting (which copies everything from .pnpm/), this only fills gaps
  // for packages we actually need. Deterministic and auditable.
  const pnpmDir = join(deployedNodeModules, '.pnpm')
  const hoisted = []
  for (const pkg of EXTERNALS) {
    const pkgParts = pkg.startsWith('@') ? pkg.split('/') : [pkg]
    const destPath = join(OUT_NODE_MODULES, ...pkgParts)
    try {
      await stat(destPath)
      continue // Already exists at top-level
    } catch {
      // Not at top-level — search in .pnpm/
    }

    // .pnpm/ uses a flat naming convention: <pkg-name>@<version>/node_modules/<pkg-name>
    // For scoped packages: @scope+name@version/node_modules/@scope/name
    let found = false
    try {
      const pnpmEntries = await readdir(pnpmDir)
      // Build the prefix to match (e.g., "hono@" or "@anthropic-ai+sdk@")
      const pnpmPrefix = pkg.replace(/\//g, '+') + '@'
      for (const entry of pnpmEntries) {
        if (entry.startsWith(pnpmPrefix)) {
          const srcPath = join(pnpmDir, entry, 'node_modules', ...pkgParts)
          try {
            await stat(srcPath)
            await cp(srcPath, destPath, { recursive: true, dereference: true })
            hoisted.push(pkg)
            found = true
            break
          } catch {
            // This version dir doesn't have the expected structure, try next
          }
        }
      }
    } catch {
      // .pnpm/ doesn't exist or can't be read
    }

    if (!found) {
      console.warn(`  Warning: '${pkg}' not found in top-level or .pnpm/`)
    }
  }

  if (hoisted.length > 0) {
    console.log(`  Hoisted: ${hoisted.join(', ')}`)
  }

  // Clean up temp directory (after hoist, since hoist reads .pnpm/)
  await rm(TEMP_DEPLOY_DIR, { recursive: true, force: true })
  console.log('  Cleaned up temp deploy directory')

  // 3. Verify all external imports via isolated subprocess
  // Why subprocess: createRequire.resolve() walks up parent directories, finding
  // monorepo root node_modules/ → false positives. By running in /tmp/ with a
  // symlinked node_modules, Node.js resolution is fully isolated.
  console.log('\n[3/5] Verifying external imports (isolated subprocess)...')

  // First, extract all external imports from bundled output
  const allImportedPkgs = new Set()
  for (const entryName of Object.keys(ENTRY_POINTS)) {
    const bundlePath = join(DEPS_DIR, `${entryName}.js`)
    const bundleContent = await readFile(bundlePath, 'utf-8')

    // Extract external imports from the bundled output.
    // esbuild ESM output uses: import ... from "pkg" and import "pkg"
    // Also handle re-exports: export ... from "pkg"
    const importRegex = /(?:import|export)\s.*?from\s*["']([^"'./][^"']*)["']|import\s*["']([^"'./][^"']*)["']/g
    let match
    while ((match = importRegex.exec(bundleContent)) !== null) {
      const raw = match[1] || match[2]
      // Normalize to package name (e.g., "@scope/pkg/sub" → "@scope/pkg", "pkg/sub" → "pkg")
      const parts = raw.startsWith('@') ? raw.split('/').slice(0, 2) : raw.split('/').slice(0, 1)
      allImportedPkgs.add(parts.join('/'))
    }
  }

  // Filter out Node.js built-in modules
  const NODE_BUILTINS = new Set([
    'fs', 'path', 'os', 'child_process', 'crypto', 'http', 'https', 'net',
    'url', 'util', 'stream', 'events', 'buffer', 'module', 'worker_threads',
    'tty', 'assert', 'zlib', 'dns', 'tls', 'async_hooks', 'perf_hooks',
    'v8', 'vm', 'readline', 'string_decoder', 'querystring',
    'diagnostics_channel', 'inspector',
  ])
  const pkgsToVerify = [...allImportedPkgs].filter(
    pkg => !pkg.startsWith('node:') && !NODE_BUILTINS.has(pkg),
  )

  // CJS/ESM compatibility check (static analysis — extra defense layer)
  const cjsErrors = []
  for (const entryName of Object.keys(ENTRY_POINTS)) {
    const bundlePath = join(DEPS_DIR, `${entryName}.js`)
    const bundleContent = await readFile(bundlePath, 'utf-8')
    for (const pkg of pkgsToVerify) {
      try {
        const pkgParts = pkg.startsWith('@') ? pkg.split('/').slice(0, 2) : pkg.split('/').slice(0, 1)
        const pkgJsonPath = join(OUT_NODE_MODULES, ...pkgParts, 'package.json')
        const pkgJson = JSON.parse(await readFile(pkgJsonPath, 'utf-8'))
        const isCjs = pkgJson.type !== 'module' && !pkgJson.exports
        if (isCjs) {
          const namedImportRegex = new RegExp(`import\\s*\\{[^}]+\\}\\s*from\\s*["']${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:/[^"']*)?["']`)
          if (namedImportRegex.test(bundleContent)) {
            cjsErrors.push({ entry: `${entryName}.js`, pkg })
          }
        }
      } catch {
        // Can't read package.json — not necessarily an error
      }
    }
  }

  // Create isolated verification environment in /tmp/
  const verifyDir = join(tmpdir(), `golemancy-verify-${Date.now()}`)
  await mkdir(verifyDir, { recursive: true })
  try {
    // Symlink node_modules so Node.js resolution only sees our bundled deps
    await symlink(OUT_NODE_MODULES, join(verifyDir, 'node_modules'))

    // Generate verification script
    const verifyScript = `
const pkgs = ${JSON.stringify(pkgsToVerify)};
const errors = [];
for (const pkg of pkgs) {
  try {
    await import(pkg);
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND') {
      errors.push(pkg);
    }
    // Other errors (e.g., missing native deps at init) mean the package WAS found
    // but failed to initialize — that's a runtime issue, not a bundling issue.
  }
}
process.stdout.write(JSON.stringify({ errors, total: pkgs.length }));
process.exit(errors.length > 0 ? 1 : 0);
`
    const verifyScriptPath = join(verifyDir, '_verify.mjs')
    await writeFile(verifyScriptPath, verifyScript)

    // Run verification in subprocess
    let verifyResult
    try {
      const stdout = execFileSync(process.execPath, [verifyScriptPath], {
        cwd: verifyDir,
        encoding: 'utf-8',
        timeout: 30_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      verifyResult = JSON.parse(stdout)
    } catch (err) {
      // Non-zero exit code — parse stdout for error details
      if (err.stdout) {
        try {
          verifyResult = JSON.parse(err.stdout)
        } catch {
          console.error('  Verification subprocess failed:', err.stderr || err.message)
          process.exit(1)
        }
      } else {
        console.error('  Verification subprocess failed:', err.stderr || err.message)
        process.exit(1)
      }
    }

    // Combine subprocess errors with CJS errors
    const allErrors = []
    for (const pkg of verifyResult.errors) {
      allErrors.push({ pkg, type: 'missing' })
    }
    for (const err of cjsErrors) {
      allErrors.push({ pkg: err.pkg, type: 'cjs-named-import', entry: err.entry })
    }

    if (allErrors.length > 0) {
      console.error('\n  Verification FAILED:')
      for (const err of allErrors) {
        if (err.type === 'missing') {
          console.error(`  ERROR: Cannot resolve '${err.pkg}' from deps/node_modules`)
          console.error(`    → Fix: Add '${err.pkg}' to BUNDLE_INLINE in scripts/bundle-server.mjs`)
        } else if (err.type === 'cjs-named-import') {
          console.error(`  ERROR [${err.entry}]: '${err.pkg}' is CJS but used with named ESM imports`)
          console.error(`    → Fix: Add '${err.pkg}' to BUNDLE_INLINE in scripts/bundle-server.mjs`)
        }
      }
      process.exit(1)
    }

    console.log(`  All ${verifyResult.total} external imports verified ✓`)
  } finally {
    // Clean up verification temp directory
    await rm(verifyDir, { recursive: true, force: true })
  }

  // 4. Prune unnecessary files from node_modules
  console.log('\n[4/5] Pruning unnecessary files from node_modules...')
  const removedCount = await pruneDir(OUT_NODE_MODULES)
  console.log(`  Removed ${removedCount} unnecessary files/directories`)

  // 5. Fix binary permissions
  console.log('\n[5/5] Fixing binary permissions...')
  await preserveBinaryPermissions(OUT_NODE_MODULES)

  console.log('\nServer bundle complete.')
}

bundleServer().catch((err) => {
  console.error(err)
  process.exit(1)
})
