import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  archNameFromElectronBuilderArch,
  findAppBundle,
  normalizeExecutablePermissions,
  removeIfExists,
  walkDirs,
} from './electron-builder-mac-utils.mjs'

async function pruneNodeRuntime(resourcesDir) {
  const nodeDir = join(resourcesDir, 'runtime', 'node')
  await removeIfExists(join(nodeDir, 'include'))
  await removeIfExists(join(nodeDir, 'share'))
  await removeIfExists(join(nodeDir, 'CHANGELOG.md'))
  await removeIfExists(join(nodeDir, 'README.md'))
}

async function prunePythonRuntime(resourcesDir) {
  const pythonDir = join(resourcesDir, 'runtime', 'python')
  await removeIfExists(join(pythonDir, 'share'))
  await removeIfExists(join(pythonDir, 'lib', 'tk9.0', 'demos'))
  await removeIfExists(join(pythonDir, 'lib', 'python3.13', 'turtledemo'))
  await removeIfExists(join(pythonDir, 'lib', 'python3.13', 'idlelib'))
  await removeIfExists(join(pythonDir, 'lib', 'python3.13', 'config-3.13-darwin'))

  for (const file of [
    'idle3',
    'idle3.13',
    'pydoc3',
    'pydoc3.13',
    'python3-config',
    'python3.13-config',
  ]) {
    await removeIfExists(join(pythonDir, 'bin', file))
  }
}

async function pruneSandboxRuntime(resourcesDir) {
  const sandboxRoot = join(resourcesDir, 'server', 'deps', 'node_modules', '@anthropic-ai', 'sandbox-runtime')
  for (const relativePath of [
    join('dist', 'vendor', 'seccomp'),
    join('dist', 'vendor', 'seccomp-src'),
    join('vendor', 'seccomp'),
    join('vendor', 'seccomp-src'),
  ]) {
    await removeIfExists(join(sandboxRoot, relativePath))
  }
}

async function pruneAgentBrowser(resourcesDir, targetPlatform, targetArch) {
  const binDir = join(resourcesDir, 'server', 'deps', 'node_modules', 'agent-browser', 'bin')
  let entries
  try {
    entries = await readdir(binDir, { withFileTypes: true })
  } catch {
    return
  }

  const currentBinary = `agent-browser-${targetPlatform}-${targetArch}${targetPlatform === 'win32' ? '.exe' : ''}`
  const keep = new Set(['agent-browser.js', currentBinary])

  for (const entry of entries) {
    if (!keep.has(entry.name)) {
      await removeIfExists(join(binDir, entry.name))
    }
  }
}

async function prunePrebuilds(resourcesDir, targetPlatform, targetArch) {
  const nodeModulesDir = join(resourcesDir, 'server', 'deps', 'node_modules')
  const keepPrefixes = new Set([`${targetPlatform}-${targetArch}`])

  if (targetPlatform === 'darwin') {
    keepPrefixes.add(`${targetPlatform}-universal`)
  }

  await walkDirs(nodeModulesDir, async (dirPath, dirName) => {
    if (dirName !== 'prebuilds') return

    const entries = await readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const shouldKeep = [...keepPrefixes].some(prefix => entry.name.startsWith(prefix))
      if (!shouldKeep) {
        await removeIfExists(join(dirPath, entry.name))
      }
    }
  })
}

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const targetArch = archNameFromElectronBuilderArch(context.arch)
  const appPath = await findAppBundle(context.appOutDir)
  const resourcesDir = join(appPath, 'Contents', 'Resources')

  console.log(`[afterPack] pruning mac bundle for ${context.electronPlatformName}-${targetArch}`)

  await pruneNodeRuntime(resourcesDir)
  await prunePythonRuntime(resourcesDir)
  await pruneSandboxRuntime(resourcesDir)
  await pruneAgentBrowser(resourcesDir, context.electronPlatformName, targetArch)
  await prunePrebuilds(resourcesDir, context.electronPlatformName, targetArch)
  await normalizeExecutablePermissions(resourcesDir)
}
