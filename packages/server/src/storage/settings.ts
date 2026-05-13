import path from 'node:path'
import fs from 'node:fs/promises'
import type { GlobalSettings, ISettingsService } from '@golemancy/shared'
import { readJson, writeJson } from './base'
import { getDataDir } from '../utils/paths'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:settings' })

const DEFAULT_SETTINGS: GlobalSettings = {
  providers: {},
  theme: 'dark',
  styleTheme: 'pixel',
}

// One-shot Windows warning — settings.json is rewritten on every change, so
// without this flag we'd spam the log with "skipped chmod" every save.
let warnedWindowsChmod = false

/**
 * Tighten settings.json permissions to user-only (0600). settings.json carries
 * OAuth refresh tokens — restrict reads to the running user.
 *
 * - POSIX (macOS/Linux): chmod 600. On failure (rare — readonly fs?), warn but
 *   don't fail the write — the data is still safer-than-default and a failed
 *   chmod shouldn't lose the user's settings.
 * - Windows: `fs.chmod` only toggles the read-only bit, not POSIX semantics.
 *   We rely on `%APPDATA%` ACL inheritance instead and emit a single startup-
 *   level warning so the difference is observable in logs.
 */
async function tightenSettingsPerms(filePath: string): Promise<void> {
  if (process.platform === 'win32') {
    if (!warnedWindowsChmod) {
      warnedWindowsChmod = true
      log.warn({ filePath }, 'Windows: chmod 600 skipped, relying on %APPDATA% ACL')
    }
    return
  }
  try {
    await fs.chmod(filePath, 0o600)
  } catch (err) {
    log.warn({ err, filePath }, 'failed to chmod 600 on settings.json')
  }
}

export class FileSettingsStorage implements ISettingsService {
  private get settingsPath() {
    return path.join(getDataDir(), 'settings.json')
  }

  /** Write settings.json and tighten its permissions in one step. */
  private async writeSettings(data: GlobalSettings): Promise<void> {
    await writeJson(this.settingsPath, data)
    await tightenSettingsPerms(this.settingsPath)
  }

  async get(): Promise<GlobalSettings> {
    const raw = await readJson<Record<string, unknown>>(this.settingsPath)
    log.debug('loaded settings')
    const merged = { ...DEFAULT_SETTINGS, ...raw }

    // Migrate v1 providers array → v2 Record
    if (Array.isArray(merged.providers)) {
      const record: Record<string, import('@golemancy/shared').ProviderEntry> = {}
      for (const p of merged.providers as Array<{ provider?: string; apiKey?: string; baseUrl?: string; defaultModel?: string }>) {
        const key = p.provider ?? 'custom'
        record[key] = {
          name: key.charAt(0).toUpperCase() + key.slice(1),
          apiKey: p.apiKey,
          baseUrl: p.baseUrl,
          sdkType: (key === 'anthropic' ? 'anthropic' : key === 'google' ? 'google' : key === 'openai' ? 'openai' : 'openai-compatible') as import('@golemancy/shared').ProviderSdkType,
          models: p.defaultModel ? [p.defaultModel] : [],
        }
      }
      merged.providers = record
      // Write migrated data back through the perm-tightening path.
      await this.writeSettings(merged as GlobalSettings)
      log.info('migrated v1 providers array to v2 Record format')
    }

    return merged as GlobalSettings
  }

  async update(data: Partial<GlobalSettings>): Promise<GlobalSettings> {
    const existing = await this.get()
    log.debug('updating settings')
    const updated: GlobalSettings = { ...existing, ...data }
    // Clean up null values sent by the client (undefined → null serialization for "clear" intent)
    for (const key of Object.keys(updated) as Array<keyof GlobalSettings>) {
      if (updated[key] === null) {
        delete (updated as unknown as Record<string, unknown>)[key]
      }
    }
    await this.writeSettings(updated)
    return updated
  }

  async testProvider(_slug: string): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
    // Actual testing is done in the route handler which has access to AI SDK.
    // This method exists to satisfy the interface; the route calls storage.get() directly.
    throw new Error('testProvider should be called via the HTTP route, not storage directly')
  }
}
