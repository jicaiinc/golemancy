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

/** Kill lingering test processes — server child processes and Electron instances (cross-platform) */
export function killLingeringServers(): void {
  if (process.platform === 'win32') {
    // Kill server child processes
    try {
      execSync(
        'wmic process where "CommandLine like \'%packages/server/src/index%\'" call terminate',
        { stdio: 'ignore' },
      )
    } catch { /* no matching processes */ }
    // Kill Electron test instances (CommandLine contains 'golemancy' — won't touch production Golemancy.exe)
    try {
      execSync(
        'wmic process where "Name=\'electron.exe\' AND CommandLine like \'%golemancy%\'" call terminate',
        { stdio: 'ignore' },
      )
    } catch { /* no matching processes */ }
  } else {
    try { execSync("pkill -f 'packages/server/src/index\\.ts'", { stdio: 'ignore' }) } catch { /* */ }
    try { execSync("pkill -f 'electron.*golemancy'", { stdio: 'ignore' }) } catch { /* */ }
  }
}
