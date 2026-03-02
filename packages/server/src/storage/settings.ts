import path from 'node:path'
import type { GlobalSettings, ISettingsService } from '@golemancy/shared'
import { readJson, writeJson } from './base'
import { getDataDir } from '../utils/paths'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:settings' })

const DEFAULT_SETTINGS: GlobalSettings = {
  providers: {},
  theme: 'dark',
}

export class FileSettingsStorage implements ISettingsService {
  private get settingsPath() {
    return path.join(getDataDir(), 'settings.json')
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
      // Write migrated data back
      await writeJson(this.settingsPath, merged)
      log.info('migrated v1 providers array to v2 Record format')
    }

    return merged as GlobalSettings
  }

  async update(data: Partial<GlobalSettings>): Promise<GlobalSettings> {
    const existing = await this.get()
    log.debug('updating settings')
    const updated: GlobalSettings = { ...existing, ...data }
    await writeJson(this.settingsPath, updated)
    return updated
  }

  async testProvider(_slug: string): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
    // Actual testing is done in the route handler which has access to AI SDK.
    // This method exists to satisfy the interface; the route calls storage.get() directly.
    throw new Error('testProvider should be called via the HTTP route, not storage directly')
  }

  async testEmbedding(_apiKey: string, _model: string): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
    throw new Error('testEmbedding should be called via the HTTP route, not storage directly')
  }
}
