import { execSync, execFileSync } from 'child_process'

/** Get absolute path to Node.js executable (cross-platform) */
export function getNodePath(): string {
  return process.execPath
}

/** Check if a command is available in PATH (cross-platform) */
export function hasCommand(cmd: string): boolean {
  try {
    if (process.platform === 'win32') {
      execFileSync('where', [cmd], { encoding: 'utf-8', stdio: 'pipe', timeout: 5000 })
    } else {
      execFileSync('which', [cmd], { encoding: 'utf-8', stdio: 'pipe', timeout: 5000 })
    }
    return true
  } catch {
    return false
  }
}

/** Kill lingering server processes (cross-platform) */
export function killLingeringServers(): void {
  try {
    if (process.platform === 'win32') {
      execSync(
        'wmic process where "CommandLine like \'%packages/server/src/index%\'" call terminate',
        { stdio: 'ignore' },
      )
    } else {
      execSync("pkill -f 'packages/server/src/index\\.ts'", { stdio: 'ignore' })
    }
  } catch {
    // No matching processes — expected
  }
}
