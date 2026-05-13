/**
 * Blacklist-based environment variable filtering for sandboxed processes.
 *
 * Replaces the old whitelist approach (safe-env.ts) — instead of enumerating
 * every "safe" variable, we pattern-match known sensitive variable names and
 * let everything else through. This eliminates the maintenance burden of
 * manually registering each new legitimate variable (UV_PYTHON, SSL_CERT_FILE,
 * LANG, etc.).
 *
 * Three categories of blocked variables:
 * 1. Secrets & credentials — API keys, tokens, passwords, connection strings
 * 2. Process behavior injection — BASH_ENV, LD_PRELOAD, DYLD_* etc. that let
 *    a child process execute arbitrary code or load arbitrary libraries
 * 3. Host process noise — npm_config_*, test runner vars that leak from the
 *    parent process and alter child behavior (e.g., npx cache resolution)
 */

/**
 * Patterns that match environment variable names to strip from sandbox env.
 * Any key matching at least one pattern is removed.
 */
const SECRET_PATTERNS: RegExp[] = [
  // ═══ 1. Secrets & Credentials ══════════════════════════════

  // ── Generic credential suffixes ────────────────────────────
  /(?:API|ACCESS|AUTH|SECRET|PRIVATE)[-_]?KEY/i,
  /(?:_TOKEN|_PASSWORD|_CREDENTIAL|_PASSWD)$/i,
  /(?:^TOKEN$|^PASSWORD$|^CREDENTIAL$)/i,
  /_SECRET$/i,

  // ── AI / Cloud provider prefixes ───────────────────────────
  /^(?:ANTHROPIC|OPENAI|GOOGLE_AI|AZURE|AWS)_/i,
  /^(?:MISTRAL|COHERE|TOGETHER|REPLICATE|FIREWORKS|GROQ|DEEPSEEK|XAI)_/i,

  // ── Git hosting tokens ────────────────────────────────────
  /^(?:GITHUB|GITLAB|BITBUCKET)_(?:TOKEN|PAT|SECRET)/i,

  // ── Application internal variables ─────────────────────────
  /^GOLEMANCY_/i,
  /^POSTHOG_/i,
  /^SENTRY_/i,

  // ── Database connection strings ────────────────────────────
  /^(?:DATABASE|REDIS|MONGO|MYSQL|POSTGRES|SUPABASE)_/i,
  /^(?:DB_|PGPASSWORD|MYSQL_PWD)/i,

  // ── Generic connection strings ─────────────────────────────
  /(?:CONNECTION_STRING|_DSN)$/i,

  // ── Credential delegation ──────────────────────────────────
  // Prevent sandbox from inheriting host's SSH agent, GCP service
  // account, K8s context, or Docker auth.
  /^(?:SSH_AUTH_SOCK|GPG_AGENT_INFO)$/,
  /^(?:GOOGLE_APPLICATION_CREDENTIALS|KUBECONFIG|DOCKER_CONFIG)$/,

  // ═══ 2. Process Behavior Injection ═════════════════════════

  // ── Shell injection vectors ────────────────────────────────
  // BASH_ENV is sourced by bash before executing -c commands.
  // PROMPT_COMMAND executes after every command in interactive mode.
  // ENV is sourced by sh/dash for non-interactive shells.
  /^(?:BASH_ENV|ENV|PROMPT_COMMAND)$/,
  /^BASH_FUNC_/,

  // ── Dynamic library injection ──────────────────────────────
  // LD_PRELOAD / DYLD_INSERT_LIBRARIES let the child process load
  // arbitrary shared libraries — a direct code execution vector.
  /^(?:LD_PRELOAD|LD_LIBRARY_PATH)$/,
  /^DYLD_/,

  // ═══ 3. Host Process Noise ═════════════════════════════════

  // ── npm / pnpm config ──────────────────────────────────────
  // npm_config_* vars from pnpm/npm parent process change npx
  // resolution behavior and cache hash. npm_config_cache is
  // re-injected where needed via runtime env overlay.
  /^npm_config_/i,

  // ── Test runner env vars ───────────────────────────────────
  // Prevent vitest/jest/playwright internals from leaking into
  // sandbox child processes.
  /^(?:VITEST|JEST_WORKER_ID|PLAYWRIGHT_)/,
]

/**
 * Test whether an environment variable name matches a known secret pattern.
 * Exported for unit testing.
 */
export function isSecretKey(key: string): boolean {
  return SECRET_PATTERNS.some(pattern => pattern.test(key))
}

/**
 * Return a copy of the given env with all secret-matching keys removed.
 * Non-string values (undefined) are also excluded from the result.
 *
 * @param env - Typically `process.env`
 * @returns Clean env record with only non-secret string values
 */
export function stripSecrets(env: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && !isSecretKey(key)) {
      result[key] = value
    }
  }
  return result
}
