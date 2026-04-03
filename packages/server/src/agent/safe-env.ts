/**
 * Safe environment variable allowlist for sandboxed processes.
 * Only these variables are passed to child processes in sandbox mode.
 */
const SAFE_ENV_KEYS = new Set([
  // Unix
  'HOME', 'USER', 'LOGNAME', 'SHELL', 'PATH',
  'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'COLORTERM',
  'TZ', 'TMPDIR', 'XDG_RUNTIME_DIR',
  'NODE_ENV', 'NODE_OPTIONS',
  'SSL_CERT_FILE',
  // uv/uvx — set by server startup (index.ts) to pin bundled Python + cache location
  'UV_PYTHON', 'UV_PYTHON_DOWNLOADS', 'UV_CACHE_DIR',
  // Windows
  'USERPROFILE', 'USERNAME', 'HOMEDRIVE', 'HOMEPATH',
  'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT',
  'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA',
  'PROGRAMFILES', 'COMMONPROGRAMFILES',
  'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE',
])

export function getSafeEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of SAFE_ENV_KEYS) {
    if (process.env[key]) env[key] = process.env[key]!
  }
  return env
}
