/**
 * Bundle the server package into a single ESM file for packaging.
 *
 * - Uses esbuild to bundle packages/server/src/index.ts
 * - Externals: better-sqlite3, @vscode/ripgrep (native/binary modules)
 * - chromium-bidi is external (optional dep of playwright-core, never used at runtime)
 * - Copies external modules + their runtime deps into resources/server/deps/node_modules/
 * - Output: apps/desktop/resources/server/deps/index.js
 *
 * Why nested deps/ directory:
 *   electron-builder hardcodes a filter that strips top-level `node_modules/` from
 *   extraResources (matches when relative === "node_modules"). By nesting everything
 *   under deps/, the relative path becomes `deps/node_modules` which is NOT filtered.
 *   This lets us use standard node_modules resolution with ESM imports.
 */

import { cp, mkdir, rm, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// Resolve esbuild from the desktop package where it's installed as a devDependency.
const desktopRequire = createRequire(join(ROOT, 'apps/desktop/package.json'))
const { build } = desktopRequire('esbuild')

const SERVER_PKG = join(ROOT, 'packages/server')
const TOOLS_PKG = join(ROOT, 'packages/tools')
const SERVER_SRC = join(SERVER_PKG, 'src/index.ts')
const OUT_DIR = join(ROOT, 'apps/desktop/resources/server')
const DEPS_DIR = join(OUT_DIR, 'deps')
const OUT_FILE = join(DEPS_DIR, 'index.js')
// Standard node_modules inside deps/ — electron-builder only strips top-level
// node_modules, so deps/node_modules survives the filter.
const OUT_NODE_MODULES = join(DEPS_DIR, 'node_modules')

// Packages that cannot be bundled:
// - better-sqlite3: C++ native .node addon
// - @vscode/ripgrep: ships platform-specific rg binary
// - chromium-bidi: optional dep of playwright-core, not installed, never used at runtime
// - playwright-core: CJS internally, its require() conflicts with just-bash's top-level await
const EXTERNALS = ['better-sqlite3', '@vscode/ripgrep', 'chromium-bidi', 'playwright-core']

/**
 * Resolve the installed directory of a package from a given context directory.
 * Returns the package root directory (the folder containing package.json).
 */
function resolvePackageDir(packageName, fromDir) {
  const contextRequire = createRequire(join(fromDir, 'index.js'))
  const resolved = contextRequire.resolve(packageName)

  // Walk up from resolved path to find the package root.
  // Split on /node_modules/ and reconstruct to get the package directory.
  const parts = resolved.split('/node_modules/')
  const lastIdx = parts.length - 1
  const prefix = parts.slice(0, lastIdx).join('/node_modules/')
  const afterNodeModules = parts[lastIdx]

  // Extract the package name portion (handles scoped packages like @vscode/ripgrep)
  let pkgDir
  if (packageName.startsWith('@')) {
    const segments = afterNodeModules.split('/')
    pkgDir = segments.slice(0, 2).join('/')
  } else {
    pkgDir = afterNodeModules.split('/')[0]
  }

  return join(prefix, 'node_modules', pkgDir)
}

/**
 * Copy a package and its transitive runtime dependencies to the output node_modules.
 */
async function copyPackageTree(pkg, resolveFrom, transitiveDeps = []) {
  const srcDir = resolvePackageDir(pkg, resolveFrom)
  const destDir = join(OUT_NODE_MODULES, pkg)
  await mkdir(dirname(destDir), { recursive: true })
  await cp(srcDir, destDir, { recursive: true })
  console.log(`  Copied ${pkg}`)

  for (const dep of transitiveDeps) {
    const depSrc = resolvePackageDir(dep, srcDir)
    const depDest = join(OUT_NODE_MODULES, dep)
    await mkdir(dirname(depDest), { recursive: true })
    await cp(depSrc, depDest, { recursive: true })
    console.log(`  Copied ${dep} (dep of ${pkg})`)
  }
}

async function bundleServer() {
  console.log('Bundling server...')

  // Clean output directory
  await rm(OUT_DIR, { recursive: true, force: true })
  await mkdir(DEPS_DIR, { recursive: true })

  // esbuild: bundle server into single ESM file
  const result = await build({
    entryPoints: [SERVER_SRC],
    outfile: OUT_FILE,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    banner: {
      // Create a CJS-compatible require() for native modules (better-sqlite3)
      // that use require() internally for .node addon loading.
      js: "import{createRequire as __cjsRequire}from'module';const require=__cjsRequire(import.meta.url);",
    },
    external: EXTERNALS,
    logLevel: 'warning',
  })

  if (result.errors.length > 0) {
    console.error('Build failed:', result.errors)
    process.exit(1)
  }

  console.log(`Bundled server → ${OUT_FILE}`)

  // Copy external modules and their runtime dependencies
  console.log('Copying external modules...')

  // better-sqlite3: needs `bindings` + `file-uri-to-path` at runtime to locate .node addon
  await copyPackageTree('better-sqlite3', SERVER_PKG, ['bindings', 'file-uri-to-path'])

  // @vscode/ripgrep: self-contained with bin/rg binary
  await copyPackageTree('@vscode/ripgrep', SERVER_PKG)

  // playwright-core: pure JS, no native deps — resolved from tools package
  await copyPackageTree('playwright-core', TOOLS_PKG)

  // Copy rg binary explicitly (postinstall downloads it, not in the npm tarball)
  const ripgrepSrc = resolvePackageDir('@vscode/ripgrep', SERVER_PKG)
  const rgBinSrc = join(ripgrepSrc, 'bin', 'rg')
  const rgBinDest = join(OUT_NODE_MODULES, '@vscode/ripgrep', 'bin', 'rg')
  try {
    await stat(rgBinSrc)
    await mkdir(dirname(rgBinDest), { recursive: true })
    await cp(rgBinSrc, rgBinDest)
    console.log('  Copied rg binary')
  } catch {
    console.warn('  Warning: rg binary not found (postinstall may not have run)')
  }

  console.log('Server bundle complete.')
}

bundleServer().catch((err) => {
  console.error(err)
  process.exit(1)
})
