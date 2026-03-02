/**
 * HTTP Service tests — mock fetch to verify request format, auth, and error handling.
 *
 * Tests all 12 HTTP service classes:
 * - Correct URL construction
 * - Bearer token attachment
 * - HTTP method and JSON body serialization
 * - 4xx/5xx → HttpError
 * - Network errors
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ProjectId, AgentId, ConversationId, TaskId, KBCollectionId, KBDocumentId, SkillId, CronJobId, PermissionsConfigId, MessageId } from '@golemancy/shared'
import { setAuthToken } from './base'
import {
  HttpProjectService,
  HttpAgentService,
  HttpConversationService,
  HttpTaskService,
  HttpWorkspaceService,
  HttpKnowledgeBaseService,
  HttpSkillService,
  HttpMCPService,
  HttpCronJobService,
  HttpSettingsService,
  HttpDashboardService,
  HttpPermissionsConfigService,
} from './services'

// ── Mock fetch ────────────────────────────────────────────────

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  }
}

function errorResponse(status: number, body = '') {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ error: body }),
    text: () => Promise.resolve(body),
  }
}

const BASE = 'http://localhost:3001'
const PROJ = 'proj-1' as ProjectId
const AGENT = 'agent-1' as AgentId

beforeEach(() => {
  vi.clearAllMocks()
  setAuthToken(null)
  mockFetch.mockResolvedValue(jsonResponse({}))
})

afterEach(() => {
  setAuthToken(null)
})

// ── Auth Token ────────────────────────────────────────────────

describe('fetchJson — auth token', () => {
  const svc = new HttpProjectService(BASE)

  it('attaches Bearer token when set', async () => {
    setAuthToken('test-token-123')
    mockFetch.mockResolvedValue(jsonResponse([]))

    await svc.list()

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token-123',
        }),
      }),
    )
  })

  it('does NOT attach Authorization header when token is null', async () => {
    setAuthToken(null)
    mockFetch.mockResolvedValue(jsonResponse([]))

    await svc.list()

    const headers = mockFetch.mock.calls[0][1].headers
    expect(headers.Authorization).toBeUndefined()
  })

  it('always sets Content-Type to application/json', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]))

    await svc.list()

    const headers = mockFetch.mock.calls[0][1].headers
    expect(headers['Content-Type']).toBe('application/json')
  })
})

// ── HTTP Error Handling ───────────────────────────────────────

describe('fetchJson — error handling', () => {
  const svc = new HttpProjectService(BASE)

  it('throws HttpError on 404', async () => {
    mockFetch.mockResolvedValue(errorResponse(404, 'Not found'))

    await expect(svc.getById(PROJ)).rejects.toThrow('404')
  })

  it('throws HttpError on 500', async () => {
    mockFetch.mockResolvedValue(errorResponse(500, 'Internal server error'))

    await expect(svc.list()).rejects.toThrow('500')
  })

  it('throws on network error', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(svc.list()).rejects.toThrow('Failed to fetch')
  })
})

// ── HttpProjectService ────────────────────────────────────────

describe('HttpProjectService', () => {
  const svc = new HttpProjectService(BASE)

  it('list() → GET /api/projects', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]))
    await svc.list()
    expect(mockFetch).toHaveBeenCalledWith(`${BASE}/api/projects`, expect.objectContaining({ headers: expect.any(Object) }))
  })

  it('getById() → GET /api/projects/:id', async () => {
    mockFetch.mockResolvedValue(jsonResponse(null))
    await svc.getById(PROJ)
    expect(mockFetch).toHaveBeenCalledWith(`${BASE}/api/projects/${PROJ}`, expect.any(Object))
  })

  it('create() → POST with JSON body', async () => {
    const data = { name: 'New', description: 'desc', icon: 'pickaxe' }
    mockFetch.mockResolvedValue(jsonResponse({ id: PROJ, ...data }))
    await svc.create(data)
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(data) }),
    )
  })

  it('update() → PATCH with partial JSON body', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}))
    await svc.update(PROJ, { name: 'Updated' })
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}`,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Updated' }) }),
    )
  })

  it('delete() → DELETE', async () => {
    mockFetch.mockResolvedValue(jsonResponse(null))
    await svc.delete(PROJ)
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})

// ── HttpAgentService ──────────────────────────────────────────

describe('HttpAgentService', () => {
  const svc = new HttpAgentService(BASE)

  it('list() → GET /api/projects/:projectId/agents', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]))
    await svc.list(PROJ)
    expect(mockFetch).toHaveBeenCalledWith(`${BASE}/api/projects/${PROJ}/agents`, expect.any(Object))
  })

  it('create() → POST /api/projects/:projectId/agents', async () => {
    const data = { name: 'Agent', description: '', systemPrompt: 'You are helpful', modelConfig: {} }
    mockFetch.mockResolvedValue(jsonResponse({ id: AGENT, ...data }))
    await svc.create(PROJ, data as any)
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/agents`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(data) }),
    )
  })

  it('update() → PATCH /api/projects/:projectId/agents/:id', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}))
    await svc.update(PROJ, AGENT, { name: 'Updated' } as any)
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/agents/${AGENT}`,
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('delete() → DELETE /api/projects/:projectId/agents/:id', async () => {
    mockFetch.mockResolvedValue(jsonResponse(null))
    await svc.delete(PROJ, AGENT)
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/agents/${AGENT}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})

// ── HttpConversationService ───────────────────────────────────

describe('HttpConversationService', () => {
  const svc = new HttpConversationService(BASE)
  const CONV = 'conv-1' as ConversationId

  it('list() includes agentId query param when provided', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]))
    await svc.list(PROJ, AGENT)
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/conversations?agentId=${AGENT}`,
      expect.any(Object),
    )
  })

  it('list() omits agentId when not provided', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]))
    await svc.list(PROJ)
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/conversations`,
      expect.any(Object),
    )
  })

  it('create() sends agentId and title', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}))
    await svc.create(PROJ, AGENT, 'New Chat')
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/conversations`,
      expect.objectContaining({ body: JSON.stringify({ agentId: AGENT, title: 'New Chat' }) }),
    )
  })

  it('sendMessage() throws (use useChat instead)', async () => {
    await expect(svc.sendMessage(PROJ, CONV, 'hello')).rejects.toThrow('Use useChat()')
  })

  it('saveMessage() → POST message data', async () => {
    mockFetch.mockResolvedValue(jsonResponse(null))
    const data = { id: 'msg-1' as MessageId, role: 'user', parts: [{ type: 'text', text: 'hi' }], content: 'hi' }
    await svc.saveMessage(PROJ, CONV, data)
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/conversations/${CONV}/messages`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(data) }),
    )
  })

  it('getMessages() includes pagination params', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ items: [], total: 0 }))
    await svc.getMessages(PROJ, CONV, { page: 2, pageSize: 20 })
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/conversations/${CONV}/messages?page=2&pageSize=20`,
      expect.any(Object),
    )
  })

  it('searchMessages() encodes query param', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ items: [], total: 0 }))
    await svc.searchMessages(PROJ, 'hello world', { page: 1, pageSize: 10 })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`q=${encodeURIComponent('hello world')}`),
      expect.any(Object),
    )
  })
})

// ── HttpTaskService ───────────────────────────────────────────

describe('HttpTaskService', () => {
  const svc = new HttpTaskService(BASE)
  const TASK = 'task-1' as TaskId
  const CONV = 'conv-1' as ConversationId

  it('list() without filter', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]))
    await svc.list(PROJ)
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/tasks`,
      expect.any(Object),
    )
  })

  it('list() with conversationId filter', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]))
    await svc.list(PROJ, CONV)
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/tasks?conversationId=${CONV}`,
      expect.any(Object),
    )
  })

  it('getById() → GET /tasks/:id', async () => {
    mockFetch.mockResolvedValue(jsonResponse(null))
    await svc.getById(PROJ, TASK)
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/tasks/${TASK}`,
      expect.any(Object),
    )
  })
})

// ── HttpWorkspaceService ─────────────────────────────────────

describe('HttpWorkspaceService', () => {
  const svc = new HttpWorkspaceService(BASE)

  it('listDir() → GET /workspace?path=', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]))
    await svc.listDir(PROJ, '/')
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/workspace?path=${encodeURIComponent('/')}`,
      expect.any(Object),
    )
  })

  it('readFile() → GET /workspace/file?path=', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}))
    await svc.readFile(PROJ, 'report.md')
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/workspace/file?path=${encodeURIComponent('report.md')}`,
      expect.any(Object),
    )
  })

  it('deleteFile() → DELETE /workspace/file?path=', async () => {
    mockFetch.mockResolvedValue(jsonResponse(null))
    await svc.deleteFile(PROJ, 'old.txt')
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/workspace/file?path=${encodeURIComponent('old.txt')}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('getFileUrl() returns correct URL', () => {
    const url = svc.getFileUrl(PROJ, 'image.png')
    expect(url).toBe(`${BASE}/api/projects/${PROJ}/workspace/raw?path=${encodeURIComponent('image.png')}`)
  })
})

// ── HttpKnowledgeBaseService ──────────────────────────────────

describe('HttpKnowledgeBaseService', () => {
  const svc = new HttpKnowledgeBaseService(BASE)
  const COL = 'col-1' as KBCollectionId
  const DOC = 'doc-1' as KBDocumentId

  it('listCollections() → GET /api/projects/:projectId/knowledge-base', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]))
    await svc.listCollections(PROJ)
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/knowledge-base`,
      expect.any(Object),
    )
  })

  it('createCollection() → POST with name, tier', async () => {
    const data = { name: 'Docs', tier: 'warm' as const }
    mockFetch.mockResolvedValue(jsonResponse({ id: COL, ...data }))
    await svc.createCollection(PROJ, data)
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/knowledge-base`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(data) }),
    )
  })

  it('updateCollection() → PATCH', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}))
    await svc.updateCollection(PROJ, COL, { name: 'Updated' })
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/knowledge-base/${COL}`,
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('deleteCollection() → DELETE', async () => {
    mockFetch.mockResolvedValue(jsonResponse(null))
    await svc.deleteCollection(PROJ, COL)
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/knowledge-base/${COL}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('listDocuments() → GET /knowledge-base/:colId/documents', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]))
    await svc.listDocuments(PROJ, COL)
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/knowledge-base/${COL}/documents`,
      expect.any(Object),
    )
  })

  it('ingestDocument() → POST with content and sourceType', async () => {
    const data = { content: 'Some text', sourceType: 'manual' as const }
    mockFetch.mockResolvedValue(jsonResponse({ id: DOC, ...data }))
    await svc.ingestDocument(PROJ, COL, data)
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/knowledge-base/${COL}/documents`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(data) }),
    )
  })

  it('uploadDocument() uses FormData (no JSON Content-Type)', async () => {
    const mockFile = new File(['content'], 'doc.pdf', { type: 'application/pdf' })
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: DOC }),
      text: () => Promise.resolve(''),
    })

    await svc.uploadDocument(PROJ, COL, mockFile)

    const call = mockFetch.mock.calls[0]
    expect(call[0]).toBe(`${BASE}/api/projects/${PROJ}/knowledge-base/${COL}/documents/upload`)
    expect(call[1].method).toBe('POST')
    expect(call[1].body).toBeInstanceOf(FormData)
  })

  it('deleteDocument() → DELETE', async () => {
    mockFetch.mockResolvedValue(jsonResponse(null))
    await svc.deleteDocument(PROJ, DOC)
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/knowledge-base/documents/${DOC}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('search() → POST /knowledge-base/search with query', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]))
    await svc.search(PROJ, 'test query')
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/knowledge-base/search`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ query: 'test query' }) }),
    )
  })

  it('hasVectorData() → GET /knowledge-base/has-vector-data', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ hasVectorData: true }))
    const result = await svc.hasVectorData(PROJ)
    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/knowledge-base/has-vector-data`,
      expect.any(Object),
    )
  })

  it('hasVectorData() extracts boolean from response object', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ hasVectorData: false }))
    const result = await svc.hasVectorData(PROJ)
    expect(result).toBe(false)
  })
})

// ── HttpSkillService ──────────────────────────────────────────

describe('HttpSkillService', () => {
  const svc = new HttpSkillService(BASE)

  it('importZip() uses FormData (no JSON Content-Type)', async () => {
    const mockFile = new File(['content'], 'test.zip', { type: 'application/zip' })
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ imported: [], count: 0 }),
    })

    await svc.importZip(PROJ, mockFile)

    // importZip uses raw fetch, not fetchJson
    const call = mockFetch.mock.calls[0]
    expect(call[0]).toBe(`${BASE}/api/projects/${PROJ}/skills/import-zip`)
    expect(call[1].method).toBe('POST')
    expect(call[1].body).toBeInstanceOf(FormData)
  })

  it('importZip() throws on error response', async () => {
    const mockFile = new File([''], 'bad.zip')
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Invalid zip' }),
    })

    await expect(svc.importZip(PROJ, mockFile)).rejects.toThrow('Invalid zip')
  })
})

// ── HttpMCPService ────────────────────────────────────────────

describe('HttpMCPService', () => {
  const svc = new HttpMCPService(BASE)

  it('getByName() encodes server name in URL', async () => {
    mockFetch.mockResolvedValue(jsonResponse(null))
    await svc.getByName(PROJ, 'my server')
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/mcp-servers/${encodeURIComponent('my server')}`,
      expect.any(Object),
    )
  })

  it('test() → POST /mcp-servers/:name/test', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ok: true, toolCount: 5 }))
    const result = await svc.test(PROJ, 'my-server')
    expect(result).toEqual({ ok: true, toolCount: 5 })
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/mcp-servers/${encodeURIComponent('my-server')}/test`,
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('resolveNames() filters list by names', async () => {
    mockFetch.mockResolvedValue(jsonResponse([
      { name: 'a', transportType: 'stdio' },
      { name: 'b', transportType: 'http' },
      { name: 'c', transportType: 'sse' },
    ]))
    const result = await svc.resolveNames(PROJ, ['a', 'c'])
    expect(result).toHaveLength(2)
    expect(result.map((s: any) => s.name)).toEqual(['a', 'c'])
  })
})

// ── HttpCronJobService ────────────────────────────────────────

describe('HttpCronJobService', () => {
  const svc = new HttpCronJobService(BASE)
  const CRON = 'cron-1' as CronJobId

  it('create() → POST with cron data', async () => {
    const data = { agentId: AGENT, name: 'Daily task', cronExpression: '0 9 * * *', enabled: true, scheduleType: 'cron' as const }
    mockFetch.mockResolvedValue(jsonResponse({ id: CRON, ...data }))
    await svc.create(PROJ, data)
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/cron-jobs`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(data) }),
    )
  })

  it('update() → PATCH', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}))
    await svc.update(PROJ, CRON, { enabled: false })
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/cron-jobs/${CRON}`,
      expect.objectContaining({ method: 'PATCH' }),
    )
  })
})

// ── HttpSettingsService ───────────────────────────────────────

describe('HttpSettingsService', () => {
  const svc = new HttpSettingsService(BASE)

  it('get() → GET /api/settings', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ theme: 'dark' }))
    const result = await svc.get()
    expect(result).toEqual({ theme: 'dark' })
    expect(mockFetch).toHaveBeenCalledWith(`${BASE}/api/settings`, expect.any(Object))
  })

  it('update() → PATCH /api/settings', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ theme: 'light' }))
    await svc.update({ theme: 'light' } as any)
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/settings`,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ theme: 'light' }) }),
    )
  })
})

// ── HttpDashboardService ──────────────────────────────────────

describe('HttpDashboardService', () => {
  const svc = new HttpDashboardService(BASE)
  const PID = 'proj-1' as ProjectId

  it('getSummary() → GET /api/projects/:projectId/dashboard/summary', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}))
    await svc.getSummary(PID)
    expect(mockFetch).toHaveBeenCalledWith(`${BASE}/api/projects/${PID}/dashboard/summary`, expect.any(Object))
  })

  it('getAgentStats() calls correct endpoint', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]))
    await svc.getAgentStats(PID)
    expect(mockFetch).toHaveBeenCalledWith(`${BASE}/api/projects/${PID}/dashboard/agent-stats`, expect.any(Object))
  })

  it('getRecentChats() uses default limit of 20', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]))
    await svc.getRecentChats(PID)
    expect(mockFetch).toHaveBeenCalledWith(`${BASE}/api/projects/${PID}/dashboard/recent-chats?limit=20`, expect.any(Object))
  })

  it('getTokenTrend() uses default days of 14', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]))
    await svc.getTokenTrend(PID)
    expect(mockFetch).toHaveBeenCalledWith(`${BASE}/api/projects/${PID}/dashboard/token-trend?days=14`, expect.any(Object))
  })
})

// ── HttpPermissionsConfigService ──────────────────────────────

describe('HttpPermissionsConfigService', () => {
  const svc = new HttpPermissionsConfigService(BASE)
  const PERM = 'perm-1' as PermissionsConfigId

  it('create() → POST with title, mode, config', async () => {
    const data = { title: 'Custom', mode: 'sandbox' as const, config: {} }
    mockFetch.mockResolvedValue(jsonResponse({ id: PERM, ...data }))
    await svc.create(PROJ, data as any)
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/permissions-config`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(data) }),
    )
  })

  it('duplicate() → POST /permissions-config/:id/duplicate', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}))
    await svc.duplicate(PROJ, PERM, 'Copy of Custom')
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/api/projects/${PROJ}/permissions-config/${PERM}/duplicate`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'Copy of Custom' }) }),
    )
  })
})
