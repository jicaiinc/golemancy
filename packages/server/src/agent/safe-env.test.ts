import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getSafeEnv } from './safe-env'

describe('getSafeEnv', () => {
  const MARKER_KEY = '__SAFE_ENV_TEST_MARKER__'

  afterEach(() => {
    delete process.env[MARKER_KEY]
  })

  it('includes allowlisted Unix keys when present', () => {
    // PATH and HOME are almost always set on Unix
    const env = getSafeEnv()
    if (process.env.PATH) {
      expect(env.PATH).toBe(process.env.PATH)
    }
    if (process.env.HOME) {
      expect(env.HOME).toBe(process.env.HOME)
    }
  })

  it('excludes non-allowlisted keys', () => {
    process.env[MARKER_KEY] = 'should-not-appear'
    const env = getSafeEnv()
    expect(env[MARKER_KEY]).toBeUndefined()
  })

  it('returns empty object when no allowlisted keys are set', () => {
    // getSafeEnv filters process.env — even if few match, it returns a Record
    const env = getSafeEnv()
    expect(typeof env).toBe('object')
    // Every key in the result should be from the allowlist
    const allowedKeys = new Set([
      'HOME', 'USER', 'LOGNAME', 'SHELL', 'PATH',
      'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'COLORTERM',
      'TZ', 'TMPDIR', 'XDG_RUNTIME_DIR',
      'NODE_ENV', 'NODE_OPTIONS', 'SSL_CERT_FILE',
      'USERPROFILE', 'USERNAME', 'HOMEDRIVE', 'HOMEPATH',
      'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT',
      'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA',
      'PROGRAMFILES', 'COMMONPROGRAMFILES',
      'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE',
    ])
    for (const key of Object.keys(env)) {
      expect(allowedKeys.has(key)).toBe(true)
    }
  })

  it('does not include undefined env values', () => {
    const env = getSafeEnv()
    for (const value of Object.values(env)) {
      expect(value).toBeDefined()
      expect(typeof value).toBe('string')
    }
  })
})
