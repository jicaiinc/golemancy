/**
 * Bundle the server package for Electron packaging.
 *
 * Strategy:
 *   1. Auto-detect native packages (binary addons, platform binaries)
 *   2. esbuild bundles source + all pure-JS deps (only native packages external)
 *   3. pnpm deploy + brute-force flatten (only native packages in node_modules)
 *   4. Isolated subprocess verification (import() in /tmp/ with symlinked node_modules)
 *   5. Prune unnecessary files + fix binary permissions
 *
 * Output: apps/desktop/resources/server/deps/
 *   - index.js           (bundled server entry)
 *   - sandbox-worker.js  (bundled sandbox worker entry)
 *   - node_modules/       (native packages only — ~2 packages instead of ~29)
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

// Manual override: force-external packages that auto-detection misses.
// Escape hatch for edge cases. Should normally be empty.
const FORCE_EXTERNAL = new Set([
  // Example: 'some-package-with-wasm-binary'
])

// ── Native package detection ──────────────────────────────────

/**
 * Detect native packages by scanning node_modules/.pnpm/.
 *
 * A package is "native" if any of these signals are found:
 *   1. Contains .node files (compiled C++ addons)
 *   2. Has binding.gyp at package root (node-gyp build)
 *   3. Dependencies include native build tools (bindings, prebuild-install, etc.)
 *   4. install/postinstall scripts invoke native build tools
 *   5. bin/ directory contains non-JS files (platform-specific binaries)
 */
async function detectNativePackages() {
  const pnpmDir = join(ROOT, 'node_modules/.pnpm')
  let pnpmEntries
  try {
    pnpmEntries = await readdir(pnpmDir)
  } catch {
    console.error('  Cannot read node_modules/.pnpm/ — run pnpm install first')
    process.exit(1)
  }

  const NATIVE_DEP_MARKERS = new Set([
    'bindings',
    'prebuild-install',
    'node-gyp-build',
    'node-addon-api',
    'nan',
  ])

  const NATIVE_SCRIPT_MARKERS = ['node-gyp', 'prebuild-install']

  const nativePackages = new Set()

  for (const entry of pnpmEntries) {
    // Skip non-directory entries and metadata
    if (entry.startsWith('.') || entry === 'lock.yaml') continue

    // .pnpm/ naming: <pkg>@<ver>/node_modules/<pkg>
    // Scoped: @scope+name@ver/node_modules/@scope/name
    const nodeModulesDir = join(pnpmDir, entry, 'node_modules')
    let innerEntries
    try {
      innerEntries = await readdir(nodeModulesDir)
    } catch {
      continue
    }

    for (const innerEntry of innerEntries) {
      // Skip hidden dirs and the package's own peer deps
      if (innerEntry.startsWith('.')) continue

      const pkgDirs = []
      if (innerEntry.startsWith('@')) {
        // Scoped package — check subdirectories
        try {
          const scopeEntries = await readdir(join(nodeModulesDir, innerEntry))
          for (const se of scopeEntries) {
            pkgDirs.push({ name: `${innerEntry}/${se}`, path: join(nodeModulesDir, innerEntry, se) })
          }
        } catch { continue }
      } else {
        pkgDirs.push({ name: innerEntry, path: join(nodeModulesDir, innerEntry) })
      }

      for (const { name: pkgName, path: pkgPath } of pkgDirs) {
        if (nativePackages.has(pkgName)) continue

        let isNative = false

        // Signal 1: .node files (compiled addons)
        if (!isNative) {
          isNative = await hasNodeFiles(pkgPath)
        }

        // Signal 2: binding.gyp at package root
        if (!isNative) {
          try {
            await stat(join(pkgPath, 'binding.gyp'))
            isNative = true
          } catch { /* no binding.gyp */ }
        }

        // Signal 3 & 4: Check package.json for native markers
        if (!isNative) {
          try {
            const pkgJson = JSON.parse(await readFile(join(pkgPath, 'package.json'), 'utf-8'))

            // Signal 3: Dependencies contain native build tools
            const allDeps = { ...pkgJson.dependencies, ...pkgJson.devDependencies }
            for (const dep of Object.keys(allDeps)) {
              if (NATIVE_DEP_MARKERS.has(dep)) {
                isNative = true
                break
              }
            }

            // Signal 4: install/postinstall scripts invoke native tools
            if (!isNative) {
              const scripts = pkgJson.scripts || {}
              const installScripts = [scripts.install, scripts.postinstall].filter(Boolean).join(' ')
              if (installScripts && NATIVE_SCRIPT_MARKERS.some(m => installScripts.includes(m))) {
                isNative = true
              }
            }
          } catch { /* can't read package.json */ }
        }

        // Signal 5: bin/ contains non-JS files (platform-specific binaries like rg)
        if (!isNative) {
          isNative = await hasPlatformBinaries(pkgPath)
        }

        if (isNative) {
          nativePackages.add(pkgName)
        }
      }
    }
  }

  return nativePackages
}

/** Check if a package directory contains any .node files (recursively, max 3 levels). */
async function hasNodeFiles(pkgPath) {
  return searchForExtension(pkgPath, '.node', 0, 3)
}

/** Script extensions that are NOT platform binaries. */
const SCRIPT_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.mts', '.cts',
  '.sh', '.bash', '.ps1', '.cmd', '.bat',
  '.py', '.rb', '.pl',
])

/** Check if bin/ contains non-script executables (compiled binaries like rg). */
async function hasPlatformBinaries(pkgPath) {
  const binDir = join(pkgPath, 'bin')
  let entries
  try {
    entries = await readdir(binDir)
  } catch {
    return false
  }
  for (const entry of entries) {
    const ext = entry.includes('.') ? '.' + entry.split('.').pop().toLowerCase() : ''
    // Skip known script extensions
    if (ext && SCRIPT_EXTENSIONS.has(ext)) continue
    // For extensionless files, check if it's a script (shebang) or a real binary
    try {
      const filePath = join(binDir, entry)
      const s = await stat(filePath)
      if (!s.isFile()) continue
      // Read first 2 bytes to check for shebang (#!)
      const fd = await readFile(filePath, { encoding: null })
      if (fd.length >= 2 && fd[0] === 0x23 && fd[1] === 0x21) {
        continue // Shebang script, not a native binary
      }
      return true // Non-script binary found
    } catch { /* skip */ }
  }
  return false
}

/** Recursively search for files with a given extension, with depth limit. */
async function searchForExtension(dir, ext, depth, maxDepth) {
  if (depth > maxDepth) return false
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return false
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(ext)) return true
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      if (await searchForExtension(join(dir, entry.name), ext, depth + 1, maxDepth)) return true
    }
  }
  return false
}

// ── Prune / permissions helpers ──────────────────────────────

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
      await preserveBinaryPermissions(fullPath)
    } else if (entry.isFile()) {
      if (
        entry.name.endsWith('.node') ||
        entry.name === 'rg' ||
        entry.name === 'apply-seccomp'
      ) {
        try {
          const fileStat = await stat(fullPath)
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

// ── Main bundle function ──────────────────────────────────────

async function bundleServer() {
  console.log('Bundling server...')

  // ── [1/5] Auto-detect native packages ─────────────────────
  console.log('\n[1/5] Auto-detect native packages...')
  const nativePackages = await detectNativePackages()

  // Merge with manual overrides
  for (const pkg of FORCE_EXTERNAL) {
    nativePackages.add(pkg)
  }

  // Build external list: only native packages
  // Collect ALL npm dependencies (server + workspace packages) to report bundle count
  const serverPkg = JSON.parse(await readFile(join(SERVER_PKG, 'package.json'), 'utf-8'))
  const deps = serverPkg.dependencies || {}
  const allNpmDeps = new Set()
  const workspacePkgs = []

  for (const [name, version] of Object.entries(deps)) {
    if (version.startsWith('workspace:')) {
      workspacePkgs.push(name)
    } else {
      allNpmDeps.add(name)
    }
  }

  // Also collect dependencies of workspace packages
  for (const wsPkg of workspacePkgs) {
    const pkgDir = wsPkg.replace('@golemancy/', '')
    const wsPkgJsonPath = join(ROOT, 'packages', pkgDir, 'package.json')
    try {
      const wsPkgJson = JSON.parse(await readFile(wsPkgJsonPath, 'utf-8'))
      for (const [depName, depVersion] of Object.entries(wsPkgJson.dependencies || {})) {
        if (!depVersion.startsWith('workspace:')) {
          allNpmDeps.add(depName)
        }
      }
    } catch {
      console.warn(`  Warning: could not read ${wsPkgJsonPath}`)
    }
  }

  // Only external native packages that are actually in our dependency tree
  const externals = [...allNpmDeps].filter(dep => nativePackages.has(dep))
  // Add FORCE_EXTERNAL entries unconditionally
  for (const pkg of FORCE_EXTERNAL) {
    if (!externals.includes(pkg)) externals.push(pkg)
  }

  const bundledCount = allNpmDeps.size - externals.length
  console.log(`  Native packages (externalized): ${externals.length > 0 ? externals.join(', ') : '(none)'}`)
  console.log(`  Bundled: ${bundledCount} pure-JS packages`)

  // Clean output directory
  await rm(OUT_DIR, { recursive: true, force: true })
  await mkdir(DEPS_DIR, { recursive: true })

  // ── [2/5] esbuild: bundle source + pure-JS deps ──────────
  console.log('\n[2/5] esbuild: bundle source + pure-JS deps...')
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
    external: externals,
    logLevel: 'warning',
  })

  if (result.errors.length > 0) {
    console.error('Build failed:', result.errors)
    process.exit(1)
  }

  console.log(`  Bundled ${Object.keys(ENTRY_POINTS).length} entry points → ${DEPS_DIR}`)

  // ── [3/5] pnpm deploy: copy native packages + flatten ────
  console.log('\n[3/5] pnpm deploy: copy native packages + flatten...')

  if (externals.length === 0) {
    // No native packages — skip pnpm deploy entirely
    console.log('  No external packages — skipping node_modules')
    await mkdir(OUT_NODE_MODULES, { recursive: true })
  } else {
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

    const deployedNodeModules = join(TEMP_DEPLOY_DIR, 'node_modules')
    await mkdir(OUT_NODE_MODULES, { recursive: true })

    // Step 1: Copy top-level symlink entries (dereference, skip .pnpm/)
    const topLevelEntries = await readdir(deployedNodeModules)
    for (const entry of topLevelEntries) {
      if (entry === '.pnpm' || entry.startsWith('.')) continue
      const src = join(deployedNodeModules, entry)
      const dest = join(OUT_NODE_MODULES, entry)
      await cp(src, dest, { recursive: true, dereference: true })
    }
    const copiedTopLevel = topLevelEntries.filter(e => e !== '.pnpm' && !e.startsWith('.')).length
    console.log(`  Copied ${copiedTopLevel} top-level packages`)

    // Step 2: Brute-force flatten — walk .pnpm/*/node_modules/* and copy missing packages.
    // With only ~2 native externals, the deploy tree is small. Just copy everything
    // from .pnpm that isn't already at top-level.
    const pnpmDir = join(deployedNodeModules, '.pnpm')
    let hoisted = 0
    try {
      const pnpmEntries = await readdir(pnpmDir)
      for (const pnpmEntry of pnpmEntries) {
        if (pnpmEntry.startsWith('.')) continue
        const innerNm = join(pnpmDir, pnpmEntry, 'node_modules')
        let innerEntries
        try {
          innerEntries = await readdir(innerNm)
        } catch { continue }

        for (const innerEntry of innerEntries) {
          if (innerEntry.startsWith('.')) continue
          const destPath = join(OUT_NODE_MODULES, innerEntry)

          if (innerEntry.startsWith('@')) {
            // Scoped package — merge scope directory
            let scopeEntries
            try {
              scopeEntries = await readdir(join(innerNm, innerEntry))
            } catch { continue }
            for (const scopeEntry of scopeEntries) {
              const scopedDest = join(destPath, scopeEntry)
              try {
                await stat(scopedDest)
                continue // Already exists
              } catch { /* needs copying */ }
              try {
                await mkdir(destPath, { recursive: true })
                await cp(join(innerNm, innerEntry, scopeEntry), scopedDest, { recursive: true, dereference: true })
                hoisted++
              } catch { /* skip broken entries */ }
            }
          } else {
            try {
              await stat(destPath)
              continue // Already exists
            } catch { /* needs copying */ }
            try {
              await cp(join(innerNm, innerEntry), destPath, { recursive: true, dereference: true })
              hoisted++
            } catch { /* skip broken entries */ }
          }
        }
      }
    } catch { /* no .pnpm dir */ }

    if (hoisted > 0) {
      console.log(`  Hoisted ${hoisted} additional packages from .pnpm/`)
    }

    // Step 3: Remove non-native packages from node_modules.
    // esbuild already bundled them — they don't need to be in node_modules.
    // Keep only native packages and their transitive dependencies.
    const nativeWithDeps = new Set()
    await collectNativeDeps(externals, OUT_NODE_MODULES, nativeWithDeps)

    const finalEntries = await readdir(OUT_NODE_MODULES)
    let removedPkgs = 0
    for (const entry of finalEntries) {
      if (entry.startsWith('.')) continue
      if (entry.startsWith('@')) {
        // Scoped package — check individual sub-entries
        const scopeDir = join(OUT_NODE_MODULES, entry)
        const scopeEntries = await readdir(scopeDir)
        for (const se of scopeEntries) {
          const scopedName = `${entry}/${se}`
          if (!nativeWithDeps.has(scopedName)) {
            await rm(join(scopeDir, se), { recursive: true, force: true })
            removedPkgs++
          }
        }
        // Remove scope directory if empty
        try {
          const remaining = await readdir(scopeDir)
          if (remaining.length === 0) {
            await rm(scopeDir, { recursive: true, force: true })
          }
        } catch { /* ignore */ }
      } else {
        if (!nativeWithDeps.has(entry)) {
          await rm(join(OUT_NODE_MODULES, entry), { recursive: true, force: true })
          removedPkgs++
        }
      }
    }
    console.log(`  Removed ${removedPkgs} bundled packages from node_modules (keeping only native deps)`)

    // Clean up temp directory
    await rm(TEMP_DEPLOY_DIR, { recursive: true, force: true })
    console.log('  Cleaned up temp deploy directory')
  }

  // ── [4/5] Verify external imports (isolated subprocess) ───
  console.log('\n[4/5] Verifying external imports (isolated subprocess)...')

  // Extract all external imports from bundled output
  const allImportedPkgs = new Set()
  for (const entryName of Object.keys(ENTRY_POINTS)) {
    const bundlePath = join(DEPS_DIR, `${entryName}.js`)
    const bundleContent = await readFile(bundlePath, 'utf-8')

    // Extract external imports from the bundled output.
    // Must anchor to statement boundaries to avoid matching `from"..."` inside minified code.
    // In minified ESM, statements are separated by `;`. Actual imports/exports:
    //   ;import{foo}from"pkg";  |  ;import e from"pkg";  |  ;import"pkg";  |  ;export{x}from"pkg";
    // Pattern 1: import/export ... from "pkg" (anchored to statement boundary via ^ or ;)
    // Pattern 2: import "pkg" (side-effect import)
    const importRegex = /(?:^|;)\s*(?:import|export)\b[^;]*?from\s*["']([^"'./][^"']*)["']|(?:^|;)\s*import\s*["']([^"'./][^"']*)["']/gm
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

    if (verifyResult.errors.length > 0) {
      console.error('\n  Verification FAILED:')
      for (const pkg of verifyResult.errors) {
        console.error(`  ERROR: Cannot resolve '${pkg}' from deps/node_modules`)
        console.error(`    → Fix: Add '${pkg}' to FORCE_EXTERNAL in scripts/bundle-server.mjs`)
      }
      process.exit(1)
    }

    console.log(`  All ${verifyResult.total} external imports verified ✓`)
  } finally {
    // Clean up verification temp directory
    await rm(verifyDir, { recursive: true, force: true })
  }

  // ── [5/5] Prune + fix permissions ─────────────────────────
  console.log('\n[5/5] Pruning unnecessary files + fixing permissions...')
  const removedCount = await pruneDir(OUT_NODE_MODULES)
  console.log(`  Removed ${removedCount} unnecessary files/directories`)

  await preserveBinaryPermissions(OUT_NODE_MODULES)

  console.log('\nServer bundle complete.')
}

/**
 * Recursively collect a set of packages needed by the given native externals.
 * Walks package.json dependencies to find all transitive deps.
 */
async function collectNativeDeps(externals, nodeModulesDir, result) {
  const queue = [...externals]
  while (queue.length > 0) {
    const pkg = queue.shift()
    if (result.has(pkg)) continue
    result.add(pkg)

    const pkgParts = pkg.startsWith('@') ? pkg.split('/') : [pkg]
    const pkgJsonPath = join(nodeModulesDir, ...pkgParts, 'package.json')
    try {
      const pkgJson = JSON.parse(await readFile(pkgJsonPath, 'utf-8'))
      for (const dep of Object.keys(pkgJson.dependencies || {})) {
        if (!result.has(dep)) {
          queue.push(dep)
        }
      }
    } catch {
      // Can't read package.json — package might not exist in node_modules
    }
  }
}

bundleServer().catch((err) => {
  console.error(err)
  process.exit(1)
})
