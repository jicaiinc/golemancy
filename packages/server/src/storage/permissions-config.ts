import type {
  PermissionsConfigFile,
  PermissionsConfigId,
  ProjectId,
  IPermissionsConfigService,
  SupportedPlatform,
} from '@golemancy/shared'
import { getDefaultPermissionsConfig } from '@golemancy/shared'
import { listJsonFiles, readJson, writeJson, deleteFile } from './base'
import { getDataDir, validateId } from '../utils/paths'
import { generateId } from '../utils/ids'
import { logger } from '../logger'
import path from 'node:path'

const log = logger.child({ component: 'storage:permissions-config' })

export class FilePermissionsConfigStorage implements IPermissionsConfigService {
  private readonly defaultConfig: PermissionsConfigFile

  constructor() {
    this.defaultConfig = getDefaultPermissionsConfig(process.platform as SupportedPlatform)
  }

  private permissionsConfigDir(projectId: string) {
    validateId(projectId)
    return path.join(getDataDir(), 'projects', projectId, 'permissions-config')
  }

  private configFilePath(projectId: string, id: string) {
    validateId(id)
    return path.join(this.permissionsConfigDir(projectId), `${id}.json`)
  }

  async list(projectId: ProjectId): Promise<PermissionsConfigFile[]> {
    const dir = this.permissionsConfigDir(projectId)
    const configs = await listJsonFiles<PermissionsConfigFile>(dir)

    // Filter out any disk 'default' — always use the code constant
    const userConfigs = configs.filter(c => c.id !== ('default' as PermissionsConfigId))
    return [this.defaultConfig, ...userConfigs]
  }

  async getById(projectId: ProjectId, id: PermissionsConfigId): Promise<PermissionsConfigFile | null> {
    if (id === ('default' as PermissionsConfigId)) {
      return this.defaultConfig
    }

    return readJson<PermissionsConfigFile>(this.configFilePath(projectId, id))
  }

  async create(
    projectId: ProjectId,
    data: Pick<PermissionsConfigFile, 'title' | 'mode' | 'config'>,
  ): Promise<PermissionsConfigFile> {
    const id = generateId('perm')
    const now = new Date().toISOString()

    const config: PermissionsConfigFile = {
      id,
      ...data,
      createdAt: now,
      updatedAt: now,
    }

    await writeJson(this.configFilePath(projectId, id), config)
    log.debug({ projectId, configId: id }, 'created permissions config')
    return config
  }

  async update(
    projectId: ProjectId,
    id: PermissionsConfigId,
    data: Partial<Pick<PermissionsConfigFile, 'title' | 'mode' | 'config'>>,
  ): Promise<PermissionsConfigFile> {
    if (id === ('default' as PermissionsConfigId)) {
      throw new Error('Cannot update system default config')
    }

    const existing = await this.getById(projectId, id)
    if (!existing) {
      throw new Error(`Permissions config ${id} not found`)
    }

    const updated: PermissionsConfigFile = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    }

    await writeJson(this.configFilePath(projectId, id), updated)
    log.debug({ projectId, configId: id }, 'updated permissions config')
    return updated
  }

  async delete(projectId: ProjectId, id: PermissionsConfigId): Promise<void> {
    if (id === ('default' as PermissionsConfigId)) {
      throw new Error('Cannot delete system default config')
    }

    await deleteFile(this.configFilePath(projectId, id))
    log.debug({ projectId, configId: id }, 'deleted permissions config')
  }

  async duplicate(
    projectId: ProjectId,
    sourceId: PermissionsConfigId,
    newTitle: string,
  ): Promise<PermissionsConfigFile> {
    const source = await this.getById(projectId, sourceId)
    if (!source) {
      throw new Error(`Permissions config ${sourceId} not found`)
    }

    return this.create(projectId, {
      title: newTitle,
      mode: source.mode,
      config: { ...source.config },
    })
  }
}
