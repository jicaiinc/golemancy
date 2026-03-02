/**
 * Bundle the server package for Electron packaging.
 *
 * Strategy:
 *   1. Auto-detect native packages (binary addons, platform binaries)
 *   2. esbuild bundles source + all pure-JS deps (only native packages external)
 *   3. pnpm deploy + hoisted re-install (only native packages in node_modules)
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
import { builtinModules, createRequire } from 'node:module'
import { arch as osArch, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

// ── CLI arguments ──
// --arch <arm64|x64>  Override target architecture for cross-compilation.
//   When specified and different from process.arch, native package binaries
//   (better-sqlite3 .node, ripgrep rg) are re-downloaded for the target arch.
const TARGET_ARCH = (() => {
  const idx = process.argv.indexOf('--arch')
  return (idx !== -1 && process.argv[idx + 1]) ? process.argv[idx + 1] : osArch()
})()
const IS_CROSS_ARCH = TARGET_ARCH !== osArch()

// Resolve esbuild from the desktop package where it's installed as a devDependency.
const desktopRequire = createRequire(join(ROOT, 'apps/desktop/package.json'))
const { build } = desktopRequire('esbuild')

const SERVER_PKG = join(ROOT, 'packages/server')
const OUT_DIR = join(ROOT, 'apps/desktop/resources/server')
const DEPS_DIR = join(OUT_DIR, 'deps')
const OUT_NODE_MODULES = join(DEPS_DIR, 'node_modules')
// Use project-relative temp dir — tmpdir() returns 8.3 short paths on Windows CI
// (e.g., C:\Users\RUNNER~1\...) which breaks pnpm deploy.
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
  'sqlite-vec',
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

// ── Cross-arch native binary helpers ─────────────────────────

/**
 * Re-download native binaries for the target architecture.
 * Called only when --arch differs from the host (cross-compilation).
 *
 * Each native package has a different download mechanism:
 *   - better-sqlite3: prebuild-install downloads prebuilt .node from GitHub Releases
 *   - @vscode/ripgrep: postinstall downloads rg binary (supports npm_config_arch env)
 *   - agent-browser: npm package ships all platform binaries — no action needed
 */
async function crossArchFixNativePackages(externals) {
  for (const pkg of externals) {
    const pkgDir = join(OUT_NODE_MODULES, pkg)
    try {
      await stat(pkgDir)
    } catch {
      continue // Not in output
    }

    if (pkg === 'better-sqlite3') {
      await crossArchFixBetterSqlite3(pkgDir)
    } else if (pkg === '@vscode/ripgrep') {
      await crossArchFixRipgrep(pkgDir)
    }
    // agent-browser: ships all platform binaries, no fix needed
  }
}

/**
 * Download better-sqlite3 prebuilt .node for target architecture.
 * URL pattern: https://github.com/JoshuaWise/better-sqlite3/releases/download/
 *   v{version}/better-sqlite3-v{version}-node-v{abi}-{platform}-{arch}.tar.gz
 * The tarball contains: build/Release/better_sqlite3.node
 */
async function crossArchFixBetterSqlite3(pkgDir) {
  const pkgJson = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf-8'))
  const version = pkgJson.version
  const abi = process.versions.modules // Node.js ABI version (e.g., "127" for Node 22)
  const platform = process.platform

  const filename = `better-sqlite3-v${version}-node-v${abi}-${platform}-${TARGET_ARCH}.tar.gz`
  const url = `https://github.com/JoshuaWise/better-sqlite3/releases/download/v${version}/${filename}`

  console.log(`    better-sqlite3: downloading ${TARGET_ARCH} prebuilt...`)

  const tmpFile = join(TEMP_DEPLOY_DIR, '_better-sqlite3-prebuilt.tar.gz')
  await mkdir(join(TEMP_DEPLOY_DIR), { recursive: true })

  try {
    execSync(`curl -fSL --retry 3 -o "${tmpFile}" "${url}"`, {
      stdio: 'pipe',
      encoding: 'utf-8',
    })
  } catch (err) {
    console.error(`    FAILED to download better-sqlite3 prebuilt: ${err.message}`)
    console.error(`    URL: ${url}`)
    process.exit(1)
  }

  // Extract tarball — contains build/Release/better_sqlite3.node
  const buildDir = join(pkgDir, 'build', 'Release')
  await mkdir(buildDir, { recursive: true })
  execSync(`tar xzf "${tmpFile}" -C "${pkgDir}"`, { stdio: 'pipe' })
  await rm(tmpFile, { force: true })

  // Verify the .node file exists
  try {
    await stat(join(buildDir, 'better_sqlite3.node'))
    console.log(`    better-sqlite3: ${TARGET_ARCH} prebuilt installed ✓`)
  } catch {
    console.error('    FAILED: better_sqlite3.node not found after extraction')
    process.exit(1)
  }
}

/**
 * Download @vscode/ripgrep rg binary for target architecture.
 * Uses the package's own postinstall.js with npm_config_arch override.
 */
async function crossArchFixRipgrep(pkgDir) {
  console.log(`    @vscode/ripgrep: downloading ${TARGET_ARCH} rg binary...`)

  // Remove existing bin/ so postinstall re-downloads
  await rm(join(pkgDir, 'bin'), { recursive: true, force: true })

  // Run postinstall with architecture override.
  // @vscode/ripgrep's postinstall reads npm_config_arch env var.
  try {
    execSync(`node "${join(pkgDir, 'lib', 'postinstall.js')}"`, {
      cwd: pkgDir,
      stdio: 'pipe',
      encoding: 'utf-8',
      env: {
        ...process.env,
        npm_config_arch: TARGET_ARCH,
      },
    })
    console.log(`    @vscode/ripgrep: ${TARGET_ARCH} rg binary installed ✓`)
  } catch (err) {
    console.error(`    FAILED to download ripgrep: ${err.stderr || err.message}`)
    process.exit(1)
  }
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
  '.bin',
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
  console.log(`Bundling server...${IS_CROSS_ARCH ? ` (cross-arch: ${osArch()} → ${TARGET_ARCH})` : ''}`)

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

  // Write package.json so Node.js recognizes the ESM output.
  // In the packaged Electron app, there's no parent package.json with "type": "module"
  // in the extraResources directory chain.
  await writeFile(join(DEPS_DIR, 'package.json'), JSON.stringify({ type: 'module' }) + '\n')

  // ── [3/5] pnpm deploy + hoisted re-install ─────────────────
  console.log('\n[3/5] pnpm deploy + hoisted re-install...')

  if (externals.length === 0) {
    // No native packages — skip pnpm deploy entirely
    console.log('  No external packages — skipping node_modules')
    await mkdir(OUT_NODE_MODULES, { recursive: true })
  } else {
    await rm(TEMP_DEPLOY_DIR, { recursive: true, force: true })

    // Step 1: pnpm deploy --legacy — produces package.json + node_modules
    // with compiled native addons from the pnpm store.
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
    console.log('  pnpm deploy completed')

    // Step 2: Save native package dirs from deploy (they have compiled .node files).
    // pnpm hoisted re-install doesn't run lifecycle scripts, so native addons
    // won't be compiled. We overlay these after the hoisted install.
    const deployedNodeModules = join(TEMP_DEPLOY_DIR, 'node_modules')
    const savedNativeDir = join(TEMP_DEPLOY_DIR, '_saved_native')
    await mkdir(savedNativeDir, { recursive: true })

    for (const pkg of externals) {
      // Resolve through .pnpm/ symlinks to get the real compiled package
      const pkgSrc = join(deployedNodeModules, pkg)
      try {
        await stat(pkgSrc)
        const pkgDest = join(savedNativeDir, pkg)
        await mkdir(join(pkgDest, '..'), { recursive: true })
        await cp(pkgSrc, pkgDest, { recursive: true, dereference: true })
      } catch { /* not in deploy tree — skip */ }
    }
    console.log(`  Saved ${externals.length} native packages with compiled addons`)

    // Step 3: Remove deploy node_modules, prepare for hoisted re-install
    await rm(deployedNodeModules, { recursive: true, force: true })

    // Strip workspace deps from package.json (already bundled by esbuild)
    // and promote their native dependencies so they still get installed.
    const deployedPkgJson = JSON.parse(await readFile(join(TEMP_DEPLOY_DIR, 'package.json'), 'utf-8'))
    for (const [name, version] of Object.entries(deployedPkgJson.dependencies || {})) {
      if (!String(version).startsWith('workspace:')) continue
      delete deployedPkgJson.dependencies[name]

      // Read the workspace package's deps and promote any native ones
      const pkgDir = name.replace('@golemancy/', '')
      try {
        const wsPkgJson = JSON.parse(await readFile(join(ROOT, 'packages', pkgDir, 'package.json'), 'utf-8'))
        for (const [depName, depVersion] of Object.entries(wsPkgJson.dependencies || {})) {
          if (nativePackages.has(depName) && !deployedPkgJson.dependencies[depName]) {
            deployedPkgJson.dependencies[depName] = depVersion
            console.log(`  Promoted native dep: ${depName}@${depVersion} (from ${name})`)
          }
        }
      } catch { /* workspace package not readable */ }
    }
    await writeFile(join(TEMP_DEPLOY_DIR, 'package.json'), JSON.stringify(deployedPkgJson, null, 2) + '\n')

    // Write .npmrc: hoisted layout (npm-style flat node_modules), no symlinks
    await writeFile(
      join(TEMP_DEPLOY_DIR, '.npmrc'),
      'node-linker=hoisted\nsymlink=false\n',
    )

    // Write empty pnpm-workspace.yaml so pnpm treats this as a standalone root
    await writeFile(join(TEMP_DEPLOY_DIR, 'pnpm-workspace.yaml'), 'packages: []\n')

    // Step 4: Re-install with hoisted layout — pnpm resolves version conflicts
    // by nesting incompatible versions in per-package node_modules.
    // Note: lifecycle scripts don't run in hoisted mode, which is fine — native
    // packages are overlaid from the deploy in the next step.
    //
    // Known limitation: This install runs without --frozen-lockfile because the
    // temp directory has a modified package.json (workspace deps stripped, native
    // deps promoted). The risk of version drift is limited because:
    //   1. Native packages (the critical ones) are overlaid from the pnpm deploy
    //      step which DOES use the real lockfile
    //   2. Only transitive deps of native packages come from this hoisted install
    try {
      execSync('pnpm install --prod', {
        cwd: TEMP_DEPLOY_DIR,
        stdio: 'pipe',
        encoding: 'utf-8',
      })
    } catch (err) {
      console.error('pnpm install (hoisted) failed:', err.stderr || err.message)
      process.exit(1)
    }
    console.log('  pnpm install (hoisted) completed')

    // Step 5: Copy hoisted node_modules to output (skip .pnpm/ metadata)
    const hoistedNodeModules = join(TEMP_DEPLOY_DIR, 'node_modules')
    await mkdir(OUT_NODE_MODULES, { recursive: true })

    const topLevelEntries = await readdir(hoistedNodeModules)
    let copiedCount = 0
    for (const entry of topLevelEntries) {
      if (entry === '.pnpm' || entry.startsWith('.')) continue
      const src = join(hoistedNodeModules, entry)
      const dest = join(OUT_NODE_MODULES, entry)
      await cp(src, dest, { recursive: true })
      copiedCount++
    }
    console.log(`  Copied ${copiedCount} packages (hoisted layout, version conflicts auto-nested)`)

    // Step 6: Overlay saved native packages (with compiled .node addons)
    // on top of the hoisted output, replacing the uncompiled versions.
    for (const pkg of externals) {
      const savedPkg = join(savedNativeDir, pkg)
      try {
        await stat(savedPkg)
        const destPkg = join(OUT_NODE_MODULES, pkg)
        await rm(destPkg, { recursive: true, force: true })
        await cp(savedPkg, destPkg, { recursive: true })
      } catch { /* wasn't saved — skip */ }
    }
    console.log('  Overlaid native packages with compiled addons')

    // Step 7 (cross-arch only): Re-download native binaries for target architecture.
    // The overlay in step 6 copied host-arch binaries (e.g., arm64 .node files).
    // For cross-compilation, replace them with target-arch versions.
    if (IS_CROSS_ARCH) {
      console.log(`  Cross-arch: replacing native binaries (${osArch()} → ${TARGET_ARCH})...`)
      await crossArchFixNativePackages(externals)
    }

    // Clean up temp directory
    await rm(TEMP_DEPLOY_DIR, { recursive: true, force: true })
    console.log('  Cleaned up temp deploy directory')
  }

  // ── [4/5] Verify external imports (isolated subprocess) ───
  // Known limitation: Verification uses the HOST Node.js (process.execPath), not the
  // bundled target-arch Node.js. For cross-compilation, native .node addons for the
  // target arch will fail to load on the host — but this is correctly handled: the
  // verification only checks for ERR_MODULE_NOT_FOUND (bundling errors), not load
  // failures (which are expected for cross-arch .node files). ABI mismatches are
  // caught later by the CI smoke test which uses the bundled target-arch Node.js.
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

  // Filter out Node.js built-in modules (auto-detected from running Node.js)
  const NODE_BUILTINS = new Set(builtinModules)
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

bundleServer().catch((err) => {
  console.error(err)
  process.exit(1)
})
