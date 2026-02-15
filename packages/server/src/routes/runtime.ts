import { Hono } from 'hono'
import type { ProjectId } from '@golemancy/shared'
import {
  getPythonEnvStatus,
  listPackages,
  installPackages,
  uninstallPackage,
  resetProjectPythonEnv,
} from '../runtime/python-manager'
import { getNodeRuntimeStatus } from '../runtime/node-manager'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:runtime' })

export function createRuntimeRoutes() {
  const app = new Hono()

  // GET /status — Combined runtime status
  app.get('/status', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    log.debug({ projectId }, 'getting runtime status')

    const [pythonStatus, nodeStatus] = await Promise.all([
      getPythonEnvStatus(projectId),
      getNodeRuntimeStatus(),
    ])

    return c.json({ python: pythonStatus, node: nodeStatus })
  })

  // GET /python/packages — List installed Python packages
  app.get('/python/packages', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    log.debug({ projectId }, 'listing Python packages')

    try {
      const packages = await listPackages(projectId)
      return c.json(packages)
    } catch (err) {
      log.error({ err, projectId }, 'failed to list Python packages')
      return c.json({ error: 'Failed to list packages', detail: String(err) }, 500)
    }
  })

  // POST /python/packages — Install Python packages
  // Body: { packages: string[] }
  app.post('/python/packages', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const body = await c.req.json<{ packages: string[] }>()

    if (!body.packages || !Array.isArray(body.packages) || body.packages.length === 0) {
      return c.json({ error: 'packages array is required' }, 400)
    }

    // Validate package names (basic sanitization)
    const invalidPackage = body.packages.find(p => !/^[a-zA-Z0-9._\-\[\]>=<!, ]+$/.test(p))
    if (invalidPackage) {
      return c.json({ error: `Invalid package specifier: ${invalidPackage}` }, 400)
    }

    log.info({ projectId, packages: body.packages }, 'installing Python packages')

    try {
      const output = await installPackages(projectId, body.packages)
      return c.json({ ok: true, output })
    } catch (err) {
      log.error({ err, projectId }, 'failed to install Python packages')
      return c.json({ error: 'Install failed', detail: String(err) }, 500)
    }
  })

  // DELETE /python/packages/:name — Uninstall a Python package
  app.delete('/python/packages/:name', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const name = c.req.param('name')

    if (!name || !/^[a-zA-Z0-9._-]+$/.test(name)) {
      return c.json({ error: 'Invalid package name' }, 400)
    }

    log.info({ projectId, packageName: name }, 'uninstalling Python package')

    try {
      const output = await uninstallPackage(projectId, name)
      return c.json({ ok: true, output })
    } catch (err) {
      log.error({ err, projectId, packageName: name }, 'failed to uninstall Python package')
      return c.json({ error: 'Uninstall failed', detail: String(err) }, 500)
    }
  })

  // POST /python/reset — Delete and recreate Python venv
  app.post('/python/reset', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    log.info({ projectId }, 'resetting Python venv')

    try {
      await resetProjectPythonEnv(projectId)
      return c.json({ ok: true })
    } catch (err) {
      log.error({ err, projectId }, 'failed to reset Python venv')
      return c.json({ error: 'Reset failed', detail: String(err) }, 500)
    }
  })

  return app
}
