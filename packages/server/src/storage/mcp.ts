import path from 'node:path'
import type { MCPServerConfig, MCPServerCreateData, MCPServerUpdateData, MCPProjectFile, ProjectId, IMCPService } from '@golemancy/shared'
import { readJson, writeJson } from './base'
import { getProjectPath } from '../utils/paths'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:mcp' })

export class FileMCPStorage implements IMCPService {
  private mcpJsonPath(projectId: string) {
    return path.join(getProjectPath(projectId), 'mcp.json')
  }

  private async readAll(projectId: string): Promise<MCPProjectFile> {
    const data = await readJson<MCPProjectFile>(this.mcpJsonPath(projectId))
    return data ?? { mcpServers: {} }
  }

  private async writeAll(projectId: string, data: MCPProjectFile): Promise<void> {
    await writeJson(this.mcpJsonPath(projectId), data)
  }

  /** Inject `name` from JSON key into each config object */
  private toConfig(name: string, stored: Omit<MCPServerConfig, 'name'>): MCPServerConfig {
    return { ...stored, name }
  }

  /** Strip `name` from value before writing (derived from JSON key) */
  private toStored(config: MCPServerConfig): Omit<MCPServerConfig, 'name'> {
    const { name: _, ...rest } = config
    return rest
  }

  async list(projectId: ProjectId): Promise<MCPServerConfig[]> {
    const file = await this.readAll(projectId)
    const configs = Object.entries(file.mcpServers).map(([name, stored]) =>
      this.toConfig(name, stored),
    )
    log.debug({ projectId, count: configs.length }, 'listed MCP servers')
    return configs
  }

  async getByName(projectId: ProjectId, name: string): Promise<MCPServerConfig | null> {
    const file = await this.readAll(projectId)
    const stored = file.mcpServers[name]
    return stored ? this.toConfig(name, stored) : null
  }

  async create(projectId: ProjectId, data: MCPServerCreateData): Promise<MCPServerConfig> {
    const file = await this.readAll(projectId)
    if (file.mcpServers[data.name]) {
      throw new Error(`MCP server "${data.name}" already exists`)
    }
    const config: MCPServerConfig = { ...data, enabled: data.enabled ?? true }
    file.mcpServers[data.name] = this.toStored(config)
    await this.writeAll(projectId, file)
    log.debug({ projectId, name: data.name }, 'created MCP server')
    return config
  }

  async update(projectId: ProjectId, name: string, data: MCPServerUpdateData): Promise<MCPServerConfig> {
    const file = await this.readAll(projectId)
    const existing = file.mcpServers[name]
    if (!existing) {
      throw new Error(`MCP server "${name}" not found`)
    }
    const updated: MCPServerConfig = { ...this.toConfig(name, existing), ...data, name }
    file.mcpServers[name] = this.toStored(updated)
    await this.writeAll(projectId, file)
    log.debug({ projectId, name }, 'updated MCP server')
    return updated
  }

  async delete(projectId: ProjectId, name: string): Promise<void> {
    const file = await this.readAll(projectId)
    if (!file.mcpServers[name]) {
      throw new Error(`MCP server "${name}" not found`)
    }
    delete file.mcpServers[name]
    await this.writeAll(projectId, file)
    log.debug({ projectId, name }, 'deleted MCP server')
  }

  async resolveNames(projectId: ProjectId, names: string[]): Promise<MCPServerConfig[]> {
    if (!names.length) return []
    const file = await this.readAll(projectId)
    return names
      .map(n => {
        const stored = file.mcpServers[n]
        return stored ? this.toConfig(n, stored) : null
      })
      .filter((c): c is MCPServerConfig => c != null)
  }
}
