import { spawn, spawnSync } from 'node:child_process';

// Secrets live on the OS credential store, accessed via stable system CLIs.
// This avoids the ACL drift that bites the Rust `keyring` crate when the
// caller binary's signature changes on every dev rebuild.
//
// Pattern adapted from Claude Code's auth.ts:
//   write via `security -i` + hex-encoded -X (keeps value out of argv / ps)
//   read via `security find-generic-password -w` (memoized)
//
// Service = reverse-DNS app id. Account = logical secret name (e.g.
// "openai.apiKey"). Claude Code stores one secret per app and uses $USER
// as the account; we have multiple secrets and use account-as-key instead.
//
// Linux: `secret-tool` (libsecret) — M3 wires up.
// Windows: `cmdkey` / PowerShell credential manager — M3 wires up.

export const DEFAULT_SECRET_SERVICE = 'us.jicai.golemancy';
const CACHE_TTL_MS = 5 * 60 * 1000;

export type SecretStoreOptions = {
  readonly service?: string;
};

type CacheEntry = { value: string | null; readAt: number };

export class SecretStore {
  private readonly service: string;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options: SecretStoreOptions = {}) {
    this.service = options.service ?? DEFAULT_SECRET_SERVICE;
  }

  async get(account: string): Promise<string | null> {
    const cached = this.cache.get(account);
    if (cached && Date.now() - cached.readAt < CACHE_TTL_MS) {
      return cached.value;
    }

    if (process.platform !== 'darwin') {
      throw new Error('SecretStore: non-darwin platforms are not implemented yet (M3)');
    }

    const value = await this.macosGet(account);
    this.cache.set(account, { value, readAt: Date.now() });
    return value;
  }

  async set(account: string, value: string): Promise<void> {
    if (process.platform !== 'darwin') {
      throw new Error('SecretStore: non-darwin platforms are not implemented yet (M3)');
    }
    if (!value || value.length === 0) {
      throw new Error('SecretStore.set: refusing to store empty value');
    }
    await this.macosSet(account, value);
    this.cache.set(account, { value, readAt: Date.now() });
  }

  async delete(account: string): Promise<void> {
    if (process.platform !== 'darwin') {
      throw new Error('SecretStore: non-darwin platforms are not implemented yet (M3)');
    }
    await this.macosDelete(account);
    this.cache.delete(account);
  }

  invalidate(account?: string): void {
    if (account) this.cache.delete(account);
    else this.cache.clear();
  }

  private async macosGet(account: string): Promise<string | null> {
    // -w prints just the password to stdout; rc=44 means "not found".
    const result = spawnSync(
      '/usr/bin/security',
      ['find-generic-password', '-w', '-s', this.service, '-a', account],
      { encoding: 'utf8' },
    );
    if (result.status === 0) {
      return result.stdout.replace(/\n$/, '');
    }
    if (result.status === 44) return null;
    if (result.error) throw result.error;
    throw new Error(
      `security find-generic-password failed (rc=${result.status}): ${result.stderr?.trim() ?? ''}`,
    );
  }

  private macosSet(account: string, value: string): Promise<void> {
    // Use -i (interactive) so the hex-encoded value is fed on stdin instead of argv.
    // `security -i` reads space-separated commands from stdin; we send a single
    // add-generic-password line with -U (update existing) and -X (hex value).
    const hex = Buffer.from(value, 'utf8').toString('hex');
    // Default ACL trusts only /usr/bin/security as caller. Since both reads and
    // writes go through `security` CLI, this is the most-restricted setting
    // that still works without prompting. No -A (would open ACL to any app).
    const command = `add-generic-password -U -a "${account}" -s "${this.service}" -X "${hex}"\n`;
    return new Promise((resolve, reject) => {
      const child = spawn('/usr/bin/security', ['-i'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', (b) => {
        stderr += b.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`security -i exited ${code}: ${stderr.trim()}`));
      });
      child.stdin.write(command);
      child.stdin.end();
    });
  }

  private async macosDelete(account: string): Promise<void> {
    const result = spawnSync(
      '/usr/bin/security',
      ['delete-generic-password', '-s', this.service, '-a', account],
      { encoding: 'utf8' },
    );
    if (result.status === 0 || result.status === 44) return;
    if (result.error) throw result.error;
    throw new Error(
      `security delete-generic-password failed (rc=${result.status}): ${result.stderr?.trim() ?? ''}`,
    );
  }
}

// Centralised account names so the UI side, the engine side, and the keychain
// stay in lock-step. Add new entries here when introducing new providers.
export const SECRET_ACCOUNTS = {
  openaiApiKey: 'openai.apiKey',
} as const;
export type SecretAccount = (typeof SECRET_ACCOUNTS)[keyof typeof SECRET_ACCOUNTS];
