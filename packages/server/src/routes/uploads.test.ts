import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { Hono } from 'hono'
import { createUploadRoutes } from './uploads'
import { saveUploadFromBase64 } from '../storage/uploads'

let tmpDir: string
let app: Hono

const PROJECT_ID = 'proj-uploadsRouteT'
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'golemancy-uploads-route-test-'))
  process.env.GOLEMANCY_DATA_DIR = tmpDir
  await fs.mkdir(path.join(tmpDir, 'projects', PROJECT_ID), { recursive: true })

  // Create a Hono app that mounts the upload routes like the real app does
  app = new Hono()
  app.route('/api/projects/:projectId/uploads', createUploadRoutes())
})

afterEach(async () => {
  delete process.env.GOLEMANCY_DATA_DIR
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('GET /api/projects/:projectId/uploads/:filename', () => {
  it('serves an existing upload file', async () => {
    const filename = await saveUploadFromBase64(PROJECT_ID, 'image/png', TINY_PNG_BASE64)

    const res = await app.request(`/api/projects/${PROJECT_ID}/uploads/${filename}`)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('Cache-Control')).toContain('immutable')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')

    const body = await res.arrayBuffer()
    const expected = Buffer.from(TINY_PNG_BASE64, 'base64')
    expect(Buffer.from(body)).toEqual(expected)
  })

  it('returns 404 for non-existent file', async () => {
    const res = await app.request(
      `/api/projects/${PROJECT_ID}/uploads/deadbeef12345678deadbeef12345678.png`,
    )
    expect(res.status).toBe(404)
  })

  it('returns 400 for invalid filename (path traversal)', async () => {
    const res = await app.request(
      `/api/projects/${PROJECT_ID}/uploads/..%2F..%2Fetc%2Fpasswd`,
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 for filename without hex hash', async () => {
    const res = await app.request(
      `/api/projects/${PROJECT_ID}/uploads/not-a-valid-filename.png`,
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 for filename with wrong hash length', async () => {
    const res = await app.request(
      `/api/projects/${PROJECT_ID}/uploads/abc123.png`,
    )
    expect(res.status).toBe(400)
  })
})
