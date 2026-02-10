import path from 'node:path'
import type { GlobalSettings, ISettingsService } from '@solocraft/shared'
import { readJson, writeJson } from './base'
import { getDataDir } from '../utils/paths'

const DEFAULT_SETTINGS: GlobalSettings = {
  providers: [],
  defaultProvider: 'google',
  theme: 'dark',
  userProfile: {
    name: '',
    email: '',
  },
  defaultWorkingDirectoryBase: '',
}

export class FileSettingsStorage implements ISettingsService {
  private get settingsPath() {
    return path.join(getDataDir(), 'settings.json')
  }

  async get(): Promise<GlobalSettings> {
    const settings = await readJson<GlobalSettings>(this.settingsPath)
    return settings ?? { ...DEFAULT_SETTINGS }
  }

  async update(data: Partial<GlobalSettings>): Promise<GlobalSettings> {
    const existing = await this.get()
    const updated: GlobalSettings = { ...existing, ...data }
    await writeJson(this.settingsPath, updated)
    return updated
  }
}
