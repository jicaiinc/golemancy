import { describe, it, expect } from 'vitest'
import { stripSecrets, isSecretKey } from './strip-secrets'

describe('isSecretKey', () => {
  // ── Known sensitive keys that MUST be blocked ──────────────

  const SENSITIVE_KEYS = [
    // Generic credential patterns
    'API_KEY', 'MY_API_KEY', 'ACCESS_KEY', 'SECRET_KEY', 'AUTH_KEY', 'PRIVATE_KEY',
    'MY_TOKEN', 'AUTH_TOKEN', 'SESSION_TOKEN',
    'DB_PASSWORD', 'MY_PASSWORD', 'ADMIN_PASSWD',
    'TOKEN', 'PASSWORD', 'CREDENTIAL',
    'APP_SECRET', 'CLIENT_SECRET',

    // AI provider prefixes
    'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL',
    'OPENAI_API_KEY', 'OPENAI_ORG_ID',
    'GOOGLE_AI_API_KEY',
    'AZURE_OPENAI_KEY',
    'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY',
    'MISTRAL_API_KEY',
    'COHERE_API_KEY',
    'TOGETHER_API_KEY',
    'REPLICATE_API_TOKEN',
    'GROQ_API_KEY',
    'DEEPSEEK_API_KEY',
    'XAI_API_KEY',

    // Git hosting
    'GITHUB_TOKEN', 'GITHUB_PAT', 'GITHUB_SECRET_KEY',
    'GITLAB_TOKEN', 'GITLAB_PAT',
    'BITBUCKET_TOKEN',

    // Application internal
    'GOLEMANCY_AUTH_TOKEN', 'GOLEMANCY_LAUNCH_ID',
    'POSTHOG_KEY', 'POSTHOG_HOST',
    'SENTRY_DSN', 'SENTRY_AUTH_TOKEN',

    // Database
    'DATABASE_URL', 'DATABASE_PASSWORD',
    'REDIS_URL', 'REDIS_PASSWORD',
    'MONGO_URI',
    'MYSQL_PWD',
    'POSTGRES_PASSWORD',
    'PGPASSWORD',
    'DB_HOST', 'DB_PASSWORD',
    'SUPABASE_URL', 'SUPABASE_KEY',

    // Connection strings
    'MY_CONNECTION_STRING', 'SENTRY_DSN',

    // Credential delegation
    'SSH_AUTH_SOCK', 'GPG_AGENT_INFO',
    'GOOGLE_APPLICATION_CREDENTIALS', 'KUBECONFIG', 'DOCKER_CONFIG',

    // Shell injection vectors
    'BASH_ENV', 'ENV', 'PROMPT_COMMAND',
    'BASH_FUNC_foo%%',

    // Dynamic library injection
    'LD_PRELOAD', 'LD_LIBRARY_PATH',
    'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH', 'DYLD_FRAMEWORK_PATH',

    // npm / pnpm config noise (all npm_config_* blocked)
    'npm_config__auth', 'npm_config_token',
    'npm_config_registry', 'npm_config_userconfig', 'npm_config_cache',

    // Test runner noise
    'VITEST', 'VITEST_POOL_ID',
    'JEST_WORKER_ID',
    'PLAYWRIGHT_BROWSERS_PATH',
  ]

  for (const key of SENSITIVE_KEYS) {
    it(`blocks sensitive key: ${key}`, () => {
      expect(isSecretKey(key)).toBe(true)
    })
  }

  // ── Known safe keys that MUST be allowed ───────────────────

  const SAFE_KEYS = [
    // System
    'HOME', 'USER', 'LOGNAME', 'SHELL', 'PATH',
    'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'COLORTERM',
    'TZ', 'TMPDIR', 'XDG_RUNTIME_DIR',
    'NODE_ENV', 'NODE_OPTIONS',

    // Runtime variables (the whole point of this refactor)
    // Note: npm_config_cache is now blocked (all npm_config_* stripped)
    // but re-injected via runtime env overlay where needed.
    'UV_PYTHON', 'UV_PYTHON_DOWNLOADS', 'UV_CACHE_DIR',
    'SSL_CERT_FILE',
    'PIP_CACHE_DIR', 'PIP_USE_DEPRECATED',
    'VIRTUAL_ENV',

    // Windows
    'USERPROFILE', 'USERNAME', 'HOMEDRIVE', 'HOMEPATH',
    'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT',
    'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA',

    // Other common safe variables
    'EDITOR', 'VISUAL', 'LESS', 'GPG_TTY', 'PAGER',
    'DISPLAY', 'WAYLAND_DISPLAY',
    'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME',
    'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
    'PYTHONDONTWRITEBYTECODE', 'PYTHONUNBUFFERED',
    'PORT',
  ]

  for (const key of SAFE_KEYS) {
    it(`allows safe key: ${key}`, () => {
      expect(isSecretKey(key)).toBe(false)
    })
  }
})

describe('stripSecrets', () => {
  it('removes secret keys from env', () => {
    const env: NodeJS.ProcessEnv = {
      HOME: '/home/user',
      PATH: '/usr/bin',
      ANTHROPIC_API_KEY: 'sk-ant-xxx',
      OPENAI_API_KEY: 'sk-xxx',
      GITHUB_TOKEN: 'ghp_xxx',
    }
    const result = stripSecrets(env)
    expect(result.HOME).toBe('/home/user')
    expect(result.PATH).toBe('/usr/bin')
    expect(result).not.toHaveProperty('ANTHROPIC_API_KEY')
    expect(result).not.toHaveProperty('OPENAI_API_KEY')
    expect(result).not.toHaveProperty('GITHUB_TOKEN')
  })

  it('passes through runtime variables that old whitelist required manual registration for', () => {
    const env: NodeJS.ProcessEnv = {
      UV_PYTHON: '/bundled/python',
      SSL_CERT_FILE: '/bundled/cacert.pem',
      EDITOR: 'vim',
      LESS: '-R',
    }
    const result = stripSecrets(env)
    expect(result.UV_PYTHON).toBe('/bundled/python')
    expect(result.SSL_CERT_FILE).toBe('/bundled/cacert.pem')
    expect(result.EDITOR).toBe('vim')
    expect(result.LESS).toBe('-R')
  })

  it('blocks all npm_config_* (re-added by runtime overlay where needed)', () => {
    const env: NodeJS.ProcessEnv = {
      npm_config_cache: '/cache/npm',
      npm_config_registry: 'https://registry.npmjs.org',
      npm_config_userconfig: '/home/user/.npmrc',
    }
    const result = stripSecrets(env)
    expect(result).not.toHaveProperty('npm_config_cache')
    expect(result).not.toHaveProperty('npm_config_registry')
    expect(result).not.toHaveProperty('npm_config_userconfig')
  })

  it('blocks shell injection vectors', () => {
    const env: NodeJS.ProcessEnv = {
      BASH_ENV: '/tmp/evil.sh',
      LD_PRELOAD: '/tmp/evil.so',
      DYLD_INSERT_LIBRARIES: '/tmp/evil.dylib',
      HOME: '/home/user',
    }
    const result = stripSecrets(env)
    expect(result).not.toHaveProperty('BASH_ENV')
    expect(result).not.toHaveProperty('LD_PRELOAD')
    expect(result).not.toHaveProperty('DYLD_INSERT_LIBRARIES')
    expect(result.HOME).toBe('/home/user')
  })

  it('excludes undefined values', () => {
    const env: NodeJS.ProcessEnv = {
      HOME: '/home/user',
      MISSING: undefined,
    }
    const result = stripSecrets(env)
    expect(result.HOME).toBe('/home/user')
    expect(result).not.toHaveProperty('MISSING')
  })

  it('returns a new object (does not mutate input)', () => {
    const env: NodeJS.ProcessEnv = { HOME: '/home/user' }
    const result = stripSecrets(env)
    expect(result).not.toBe(env)
  })
})
