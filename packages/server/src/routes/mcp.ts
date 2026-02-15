import { Hono } from 'hono'
import type { ProjectId, IMCPService, IAgentService, IProjectService, IPermissionsConfigService, MCPServerUpdateData, SupportedPlatform } from '@golemancy/shared'
import { mcpPool } from '../agent/mcp-pool'
import { resolvePermissionsConfig } from '../agent/resolve-permissions'
import { getProjectPath } from '../utils/paths'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:mcp' })

interface MCPRouteDeps {
  mcpStorage: IMCPService
  agentStorage: IAgentService
  projectStorage: IProjectService
  permissionsConfigStorage: IPermissionsConfigService
}

export function createMCPRoutes(deps: MCPRouteDeps) {
  const app = new Hono()

  app.get('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    log.debug({ projectId }, 'listing MCP servers')
    const servers = await deps.mcpStorage.list(projectId)
    log.debug({ projectId, count: servers.length }, 'listed MCP servers')
    return c.json(servers)
  })

  app.get('/:name', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const name = c.req.param('name')
    const server = await deps.mcpStorage.getByName(projectId, name)
    if (!server) return c.json({ error: 'MCP server not found' }, 404)
    return c.json(server)
  })

  app.post('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const body = await c.req.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return c.json({ error: 'name is required' }, 400)
    }
    const transportType = body.transportType
    if (!transportType || !['stdio', 'sse', 'http'].includes(transportType)) {
      return c.json({ error: 'transportType must be one of: stdio, sse, http' }, 400)
    }

    // Check for duplicate name
    const existing = await deps.mcpStorage.getByName(projectId, name)
    if (existing) {
      return c.json({ error: `MCP server "${name}" already exists` }, 409)
    }

    const data = {
      name,
      transportType,
      ...(typeof body.description === 'string' ? { description: body.description } : {}),
      ...(typeof body.command === 'string' ? { command: body.command } : {}),
      ...(Array.isArray(body.args) ? { args: body.args } : {}),
      ...(body.env && typeof body.env === 'object' ? { env: body.env } : {}),
      ...(typeof body.cwd === 'string' ? { cwd: body.cwd } : {}),
      ...(typeof body.url === 'string' ? { url: body.url } : {}),
      ...(body.headers && typeof body.headers === 'object' ? { headers: body.headers } : {}),
      ...(typeof body.enabled === 'boolean' ? { enabled: body.enabled } : {}),
    }

    log.debug({ projectId, name }, 'creating MCP server')
    const server = await deps.mcpStorage.create(projectId, data)
    log.debug({ projectId, name }, 'created MCP server')
    return c.json(server, 201)
  })

  app.patch('/:name', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const name = c.req.param('name')
    const body = await c.req.json()

    if (body.transportType && !['stdio', 'sse', 'http'].includes(body.transportType)) {
      return c.json({ error: 'Invalid transportType' }, 400)
    }

    const data: MCPServerUpdateData = {}
    if (typeof body.transportType === 'string') data.transportType = body.transportType
    if (typeof body.description === 'string') data.description = body.description
    if (typeof body.command === 'string') data.command = body.command
    if (Array.isArray(body.args)) data.args = body.args
    if (body.env && typeof body.env === 'object') data.env = body.env
    if (typeof body.cwd === 'string') data.cwd = body.cwd
    if (typeof body.url === 'string') data.url = body.url
    if (body.headers && typeof body.headers === 'object') data.headers = body.headers
    if (typeof body.enabled === 'boolean') data.enabled = body.enabled

    log.debug({ projectId, name }, 'updating MCP server')
    try {
      const server = await deps.mcpStorage.update(projectId, name, data)

      // Invalidate pooled connection when server is disabled or config changes
      if (data.enabled === false || data.command !== undefined || data.args !== undefined
        || data.env !== undefined || data.cwd !== undefined || data.url !== undefined
        || data.headers !== undefined || data.transportType !== undefined) {
        await mcpPool.invalidateServer(projectId, name)
      }

      return c.json(server)
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        return c.json({ error: 'MCP server not found' }, 404)
      }
      throw err
    }
  })

  app.delete('/:name', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const name = c.req.param('name')
    log.debug({ projectId, name }, 'deleting MCP server')

    // Check for agent references before deleting
    const agents = await deps.agentStorage.list(projectId)
    const referencingAgents = agents.filter(a => a.mcpServers.includes(name))
    if (referencingAgents.length > 0) {
      return c.json({
        error: 'MCP server is referenced by agents',
        agents: referencingAgents.map(a => ({ id: a.id, name: a.name })),
      }, 409)
    }

    try {
      await mcpPool.invalidateServer(projectId, name)
      await deps.mcpStorage.delete(projectId, name)
      return c.json({ ok: true })
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        return c.json({ error: 'MCP server not found' }, 404)
      }
      throw err
    }
  })

  // ── Connectivity Test ─────────────────────────────────
  // Tests under the same conditions as actual runtime (including sandbox wrapping)
  app.post('/:name/test', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const name = c.req.param('name')
    const server = await deps.mcpStorage.getByName(projectId, name)
    if (!server) return c.json({ error: 'MCP server not found' }, 404)

    log.debug({ projectId, name }, 'testing MCP server connectivity')

    // Read project's permissionsConfigId so test uses the same config as runtime
    const project = await deps.projectStorage.getById(projectId)
    const configId = project?.config.permissionsConfigId

    // Resolve permissions so test uses the same sandbox wrapping as runtime
    const workspaceDir = getProjectPath(projectId) + '/workspace'
    let options: Parameters<typeof mcpPool.testConnection>[1]
    try {
      const platform = process.platform as SupportedPlatform
      const resolvedPermissions = await resolvePermissionsConfig(
        deps.permissionsConfigStorage,
        projectId,
        configId,
        workspaceDir,
        platform,
      )
      options = { projectId, workspaceDir, resolvedPermissions }
    } catch (err) {
      log.warn({ err }, 'failed to resolve permissions for MCP test, testing without sandbox')
    }

    // Restricted mode blocks all stdio servers at runtime — mirror that here
    if (options?.resolvedPermissions.mode === 'restricted' && server.transportType === 'stdio') {
      return c.json({ ok: false, toolCount: 0, error: 'stdio MCP servers are blocked in restricted mode' })
    }

    const result = await mcpPool.testConnection(server, options)
    log.debug({ projectId, name, ...result }, 'MCP connectivity test result')

    // When sandbox-wrapped test fails, hint about checking sandbox permissions
    if (!result.ok && options?.resolvedPermissions.mode === 'sandbox'
      && options.resolvedPermissions.config.applyToMCP) {
      result.error = (result.error ?? 'Connection failed')
        + '\nApply to MCP is enabled — check sandbox permissions (allowWrite, allowedDomains, deniedCommands) in Settings > Permissions'
    }

    return c.json(result)
  })

  return app
}
