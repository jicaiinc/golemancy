import { Hono } from 'hono'
import type { ProjectId, IMCPService, IAgentService, MCPServerUpdateData } from '@golemancy/shared'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:mcp' })

export function createMCPRoutes(deps: { mcpStorage: IMCPService; agentStorage: IAgentService }) {
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
      await deps.mcpStorage.delete(projectId, name)
      return c.json({ ok: true })
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        return c.json({ error: 'MCP server not found' }, 404)
      }
      throw err
    }
  })

  return app
}
