import { spawn } from 'node:child_process'
import { getBundledNodeBinDir } from './paths'
import path from 'node:path'

export interface NodeRuntimeStatus {
  /** Whether bundled Node.js is available */
  available: boolean
  /** Node.js version (e.g., "22.22.0"), null if not available */
  nodeVersion: string | null
  /** npm version (e.g., "10.x.x"), null if not available */
  npmVersion: string | null
  /** Path to bundled node bin directory, null if not available */
  binDir: string | null
}

/**
 * Get status of bundled Node.js runtime.
 */
export async function getNodeRuntimeStatus(): Promise<NodeRuntimeStatus> {
  const binDir = getBundledNodeBinDir()
  if (!binDir) {
    return { available: false, nodeVersion: null, npmVersion: null, binDir: null }
  }

  const nodeBin = path.join(binDir, 'node')
  const npmBin = path.join(binDir, 'npm')

  const [nodeVersion, npmVersion] = await Promise.all([
    getVersionOutput(nodeBin),
    getVersionOutput(npmBin),
  ])

  return {
    available: nodeVersion !== null,
    nodeVersion: nodeVersion?.replace('v', '') ?? null,
    npmVersion,
    binDir,
  }
}

async function getVersionOutput(binary: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(binary, ['--version'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    })
    let output = ''
    child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.on('close', (code) => resolve(code === 0 ? output.trim() : null))
    child.on('error', () => resolve(null))
  })
}
