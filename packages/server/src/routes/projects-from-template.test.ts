import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Project, ProjectId } from '@golemancy/shared'
import { createTestApp, makeRequest, type MockStorage } from '../test/route-helpers'
import type { Hono } from 'hono'

vi.mock('../storage/template-instantiate', () => ({
  instantiateProjectTemplate: vi.fn(),
}))

vi.mock('../runtime/python-manager', () => ({
  initProjectPythonEnv: vi.fn().mockResolvedValue(undefined),
}))

import { instantiateProjectTemplate } from '../storage/template-instantiate'

const mockInstantiate = vi.mocked(instantiateProjectTemplate)

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-tpl-1' as ProjectId,
    name: 'Template Project',
    description: 'From template',
    icon: 'book',
    config: {},
    agentCount: 1,
    activeAgentCount: 0,
    lastActivityAt: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('POST /api/projects/from-template', () => {
  let app: Hono
  let mocks: MockStorage

  beforeEach(() => {
    ({ app, mocks } = createTestApp())
    mockInstantiate.mockReset()
  })

  it('creates project from valid template (201)', async () => {
    const project = makeProject({ name: 'Writing Assistant', icon: 'book' })
    mockInstantiate.mockResolvedValue(project)
    vi.mocked(mocks.settingsStorage.get).mockResolvedValue({
      providers: {},
      theme: 'dark',
      defaultModel: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
    } as any)

    const res = await makeRequest(app, 'POST', '/api/projects/from-template', {
      templateId: 'writing-assistant',
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('Writing Assistant')
    expect(mockInstantiate).toHaveBeenCalledWith(
      'writing-assistant',
      'Writing Assistant', // falls back to template.name
      { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
    )
  })

  it('uses custom name when provided', async () => {
    const project = makeProject({ name: 'My Custom Name' })
    mockInstantiate.mockResolvedValue(project)
    vi.mocked(mocks.settingsStorage.get).mockResolvedValue({
      providers: {},
      theme: 'dark',
      defaultModel: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
    } as any)

    const res = await makeRequest(app, 'POST', '/api/projects/from-template', {
      templateId: 'writing-assistant',
      name: 'My Custom Name',
    })

    expect(res.status).toBe(201)
    expect(mockInstantiate).toHaveBeenCalledWith(
      'writing-assistant',
      'My Custom Name',
      expect.any(Object),
    )
  })

  it('returns 400 when templateId is missing', async () => {
    const res = await makeRequest(app, 'POST', '/api/projects/from-template', {})

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('VALIDATION_FAILED')
  })

  it('returns 404 when template does not exist', async () => {
    const res = await makeRequest(app, 'POST', '/api/projects/from-template', {
      templateId: 'non-existent-template',
    })

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('NOT_FOUND')
  })

  it('returns 400 when defaultModel is not configured', async () => {
    vi.mocked(mocks.settingsStorage.get).mockResolvedValue({
      providers: {},
      theme: 'dark',
      // no defaultModel
    } as any)

    const res = await makeRequest(app, 'POST', '/api/projects/from-template', {
      templateId: 'writing-assistant',
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('CONFIGURATION_REQUIRED')
  })
})
