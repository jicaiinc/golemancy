import { execFileSync, spawnSync } from 'node:child_process'
import { chmod, readdir, readFile, rm, stat } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

export const MAIN_ENTITLEMENTS = join(ROOT, 'apps/desktop/resources/build/entitlements.mac.plist')
export const INHERIT_ENTITLEMENTS = join(ROOT, 'apps/desktop/resources/build/entitlements.mac.plist')

const ARCH_NAMES = {
  0: 'ia32',
  1: 'x64',
  2: 'armv7l',
  3: 'arm64',
  4: 'universal',
}

const BINARY_EXTENSIONS = new Set(['.bare', '.dylib', '.node', '.so'])

export function archNameFromElectronBuilderArch(arch) {
  const archName = ARCH_NAMES[arch]
  if (!archName) {
    throw new Error(`Unsupported electron-builder arch value: ${arch}`)
  }
  return archName
}

export async function findAppBundle(appOutDir) {
  const entries = await readdir(appOutDir, { withFileTypes: true })
  const appEntry = entries.find(entry => entry.isDirectory() && entry.name.endsWith('.app'))
  if (!appEntry) {
    throw new Error(`No .app bundle found in ${appOutDir}`)
  }
  return join(appOutDir, appEntry.name)
}

export async function pathExists(targetPath) {
  try {
    await stat(targetPath)
    return true
  } catch {
    return false
  }
}

export async function removeIfExists(targetPath) {
  if (await pathExists(targetPath)) {
    await rm(targetPath, { recursive: true, force: true })
  }
}

export async function walkFiles(dirPath, visitor) {
  let entries
  try {
    entries = await readdir(dirPath, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      await walkFiles(fullPath, visitor)
    } else if (entry.isFile()) {
      await visitor(fullPath, entry.name)
    }
  }
}

export async function walkDirs(dirPath, visitor) {
  let entries
  try {
    entries = await readdir(dirPath, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    const fullPath = join(dirPath, entry.name)
    await visitor(fullPath, entry.name)
    await walkDirs(fullPath, visitor)
  }
}

export function getFileType(targetPath) {
  try {
    return execFileSync('file', ['-b', targetPath], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

export async function isShebangScript(targetPath) {
  try {
    const bytes = await readFile(targetPath, { encoding: null })
    return bytes.length >= 2 && bytes[0] === 0x23 && bytes[1] === 0x21
  } catch {
    return false
  }
}

export function isMachOBinary(fileType) {
  return fileType.includes('Mach-O')
}

export function isSignableBinary(targetPath, fileType) {
  if (isMachOBinary(fileType)) return true

  const extension = extname(targetPath)
  if (BINARY_EXTENSIONS.has(extension)) return true

  return false
}

export async function normalizeExecutablePermissions(dirPath) {
  await walkFiles(dirPath, async filePath => {
    const fileStat = await stat(filePath)
    const hasExecBit = Boolean(fileStat.mode & 0o111)
    const extension = extname(filePath)
    const shouldInspect = hasExecBit || BINARY_EXTENSIONS.has(extension)

    if (!shouldInspect) {
      return
    }

    const fileType = getFileType(filePath)
    const shouldBeExecutable = await isShebangScript(filePath) || isSignableBinary(filePath, fileType)

    if (shouldBeExecutable && !hasExecBit) {
      await chmod(filePath, fileStat.mode | 0o755)
    } else if (!shouldBeExecutable && hasExecBit) {
      await chmod(filePath, fileStat.mode & ~0o111)
    }
  })
}

export async function collectSignableFiles(rootDir) {
  const files = []

  await walkFiles(rootDir, async filePath => {
    const fileStat = await stat(filePath)
    const extension = extname(filePath)
    const likelyBinary = Boolean(fileStat.mode & 0o111) || BINARY_EXTENSIONS.has(extension)

    if (!likelyBinary) {
      return
    }

    const fileType = getFileType(filePath)
    if (isSignableBinary(filePath, fileType)) {
      files.push(filePath)
    }
  })

  return files.sort((a, b) => b.length - a.length)
}

export async function collectBundleDirectories(appPath) {
  const bundles = []

  await walkDirs(appPath, async (dirPath, dirName) => {
    if (dirName.endsWith('.framework') || dirName.endsWith('.app')) {
      bundles.push(dirPath)
    }
  })

  return bundles.sort((a, b) => b.length - a.length)
}

export function dumpSignatureMetadata(targetPath) {
  const result = spawnSync('codesign', ['-dv', '--verbose=4', targetPath], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (result.error) {
    throw result.error
  }

  return `${result.stdout || ''}${result.stderr || ''}`
}

export function resolveDeveloperIdIdentity(appPath) {
  if (process.env.CSC_NAME) {
    return process.env.CSC_NAME
  }

  const output = dumpSignatureMetadata(appPath)
  const match = output.match(/^Authority=(Developer ID Application: .+)$/m)
  if (!match) {
    throw new Error(`Could not determine Developer ID identity from ${appPath}`)
  }
  return match[1]
}

export function runCodesign(args) {
  try {
    execFileSync('codesign', args, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const stderr = error.stderr || ''
    const stdout = error.stdout || ''
    throw new Error(`codesign failed: ${args.join(' ')}\n${stdout}${stderr}`)
  }
}

export function verifyCodesign(targetPath) {
  runCodesign(['--verify', '--strict', '--verbose=2', targetPath])
}

export function assertTimestampedDeveloperId(targetPath) {
  const output = dumpSignatureMetadata(targetPath)
  if (!/^Authority=Developer ID Application: /m.test(output)) {
    throw new Error(`Missing Developer ID authority on ${targetPath}`)
  }
  if (!/^Timestamp=/m.test(output)) {
    throw new Error(`Missing secure timestamp on ${targetPath}`)
  }
}

export function formatSignatureSummary(targetPath) {
  const output = dumpSignatureMetadata(targetPath)
  const authority = output.match(/^Authority=(.+)$/m)?.[1] ?? '(missing authority)'
  const timestamp = output.match(/^Timestamp=(.+)$/m)?.[1] ?? '(missing timestamp)'
  return `${basename(targetPath)}\n  ${authority}\n  ${timestamp}`
}
