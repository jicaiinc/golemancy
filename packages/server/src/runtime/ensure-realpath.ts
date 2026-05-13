import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { getGlobalBinDir } from './paths'
import { logger } from '../logger'

const log = logger.child({ component: 'runtime:ensure-realpath' })

/**
 * On macOS < 13 (Ventura), `/usr/bin/realpath` does not exist.
 * uv >= 0.4.21 generates shim scripts that call `realpath` on line 2:
 *
 *     '''exec' "$(dirname -- "$(realpath -- "$0")")"/'python' "$0" "$@"
 *
 * When `realpath` is missing, the path resolution silently produces an
 * invalid relative path (`./python`), and the MCP server process crashes
 * with "No such file or directory".
 *
 * This function creates a POSIX sh polyfill at ~/.golemancy/runtime/bin/realpath
 * when the system lacks the real command. The global bin dir is already in PATH
 * via augmentProcessEnv(), so subprocess shells find the polyfill automatically.
 *
 * No-op on: Linux (always has realpath), Windows, macOS 13+.
 *
 * @see https://github.com/astral-sh/uv/issues/13807
 */
export function ensureRealpathPolyfill(): void {
  if (process.platform !== 'darwin') return

  const result = spawnSync('which', ['realpath'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 3_000,
  })
  if (result.status === 0 && result.stdout?.trim()) return

  const binDir = getGlobalBinDir()
  const polyfillPath = join(binDir, 'realpath')

  if (existsSync(polyfillPath)) {
    log.debug({ polyfillPath }, 'realpath polyfill already exists')
    return
  }

  mkdirSync(binDir, { recursive: true })
  writeFileSync(polyfillPath, REALPATH_POLYFILL, { encoding: 'utf-8' })
  chmodSync(polyfillPath, 0o755)

  log.info({ polyfillPath }, 'created realpath polyfill for macOS < 13 compatibility')
}

/**
 * Pure POSIX sh realpath implementation.
 *
 * Uses `readlink` (available on all macOS versions) to follow symlinks
 * iteratively, then `cd && pwd -P` to canonicalize the directory component.
 *
 * Handles: `--` flag separator, symlink chains, relative symlink targets.
 */
const REALPATH_POLYFILL = `#!/bin/sh
# realpath polyfill for macOS < 13 — installed by Golemancy
# https://github.com/astral-sh/uv/issues/13807
[ "$1" = "--" ] && shift
target="\${1:-.}"
while [ -L "$target" ]; do
  link=$(readlink "$target")
  case "$link" in /*) target="$link";; *) target="$(dirname "$target")/$link";; esac
done
dir=$(cd "$(dirname "$target")" 2>/dev/null && pwd -P) || exit 1
echo "$dir/$(basename "$target")"
`
