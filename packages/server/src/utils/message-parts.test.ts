import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { extractUploads, resolveUploadsForClient, rehydrateUploadsForAI } from './message-parts'

let tmpDir: string

const PROJECT_ID = 'proj-msgPartsTest'
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'golemancy-msgparts-test-'))
  process.env.GOLEMANCY_DATA_DIR = tmpDir
  await fs.mkdir(path.join(tmpDir, 'projects', PROJECT_ID), { recursive: true })
})

afterEach(async () => {
  delete process.env.GOLEMANCY_DATA_DIR
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('extractUploads', () => {
  it('extracts base64 data URLs from file parts and saves to disk', async () => {
    const parts = [
      { type: 'text', text: 'Hello' },
      { type: 'file', mediaType: 'image/png', url: TINY_PNG_DATA_URL, filename: 'photo.png' },
    ]

    const result = await extractUploads(PROJECT_ID, parts)

    // Text part unchanged
    expect(result[0]).toEqual({ type: 'text', text: 'Hello' })

    // File part now has golemancy-upload: reference
    const filePart = result[1] as Record<string, unknown>
    expect(filePart.type).toBe('file')
    expect(filePart.mediaType).toBe('image/png')
    expect(filePart.filename).toBe('photo.png')
    expect((filePart.url as string).startsWith('golemancy-upload:image/png:')).toBe(true)

    // Verify file was written to disk
    const uploadsDir = path.join(tmpDir, 'projects', PROJECT_ID, 'uploads')
    const files = await fs.readdir(uploadsDir)
    expect(files.length).toBe(1)
    expect(files[0]).toMatch(/^[a-f0-9]{32}\.png$/)
  })

  it('passes through already-extracted references', async () => {
    const parts = [
      { type: 'file', mediaType: 'image/png', url: 'golemancy-upload:image/png:abc123.png' },
    ]

    const result = await extractUploads(PROJECT_ID, parts)
    expect(result).toEqual(parts)
  })

  it('passes through non-data URLs (HTTP URLs)', async () => {
    const parts = [
      { type: 'file', mediaType: 'image/png', url: 'http://localhost:3000/api/projects/proj-x/uploads/abc123.png' },
    ]

    const result = await extractUploads(PROJECT_ID, parts)
    expect(result).toEqual(parts)
  })

  it('passes through non-file parts', async () => {
    const parts = [
      { type: 'text', text: 'Hello' },
      { type: 'tool-invocation', toolName: 'bash', state: 'result' },
    ]

    const result = await extractUploads(PROJECT_ID, parts)
    expect(result).toEqual(parts)
  })

  it('gracefully degrades on write failure', async () => {
    // Make uploads dir read-only to force write failure
    const uploadsDir = path.join(tmpDir, 'projects', PROJECT_ID, 'uploads')
    await fs.mkdir(uploadsDir, { recursive: true })
    await fs.chmod(uploadsDir, 0o444)

    const parts = [
      { type: 'file', mediaType: 'image/png', url: TINY_PNG_DATA_URL, filename: 'photo.png' },
    ]

    const result = await extractUploads(PROJECT_ID, parts)

    // Should keep the original data URL
    expect(result).toEqual(parts)

    // Restore permissions for cleanup
    await fs.chmod(uploadsDir, 0o755)
  })
})

describe('resolveUploadsForClient', () => {
  it('converts golemancy-upload: references to HTTP URLs', () => {
    const parts = [
      { type: 'text', text: 'Hello' },
      { type: 'file', mediaType: 'image/png', url: 'golemancy-upload:image/png:abc123def456abc123def456abc123de.png', filename: 'photo.png' },
    ]

    const result = resolveUploadsForClient(PROJECT_ID, 'http://127.0.0.1:3456', parts)

    expect(result[0]).toEqual(parts[0])
    const filePart = result[1] as Record<string, unknown>
    expect(filePart.url).toBe(`http://127.0.0.1:3456/api/projects/${PROJECT_ID}/uploads/abc123def456abc123def456abc123de.png`)
    expect(filePart.filename).toBe('photo.png')
    expect(filePart.mediaType).toBe('image/png')
  })

  it('passes through non-upload references', () => {
    const parts = [
      { type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,xxx' },
      { type: 'text', text: 'Hi' },
    ]

    const result = resolveUploadsForClient(PROJECT_ID, 'http://127.0.0.1:3456', parts)
    expect(result).toEqual(parts)
  })
})

describe('rehydrateUploadsForAI', () => {
  it('converts golemancy-upload: references back to data URLs', async () => {
    // First save a file
    const { extractUploads: extract } = await import('./message-parts')
    const parts = [
      { type: 'file', mediaType: 'image/png', url: TINY_PNG_DATA_URL, filename: 'photo.png' },
    ]
    const extracted = await extract(PROJECT_ID, parts)
    const ref = extracted[0] as Record<string, unknown>

    // Now rehydrate
    const result = await rehydrateUploadsForAI(PROJECT_ID, extracted)
    const rehydrated = result[0] as Record<string, unknown>

    expect(rehydrated.type).toBe('file')
    expect(rehydrated.mediaType).toBe('image/png')
    expect(rehydrated.url).toBe(TINY_PNG_DATA_URL)
    expect(rehydrated.filename).toBe('photo.png')
  })

  it('converts HTTP upload URLs back to data URLs', async () => {
    // First save a file to disk
    const { saveUploadFromBase64 } = await import('../storage/uploads')
    const filename = await saveUploadFromBase64(PROJECT_ID, 'image/png', TINY_PNG_BASE64)

    const parts = [
      { type: 'file', mediaType: 'image/png', url: `http://127.0.0.1:3456/api/projects/${PROJECT_ID}/uploads/${filename}` },
    ]

    const result = await rehydrateUploadsForAI(PROJECT_ID, parts)
    const rehydrated = result[0] as Record<string, unknown>

    expect(rehydrated.url).toBe(TINY_PNG_DATA_URL)
  })

  it('passes through original data URLs', async () => {
    const parts = [
      { type: 'file', mediaType: 'image/png', url: TINY_PNG_DATA_URL },
    ]

    const result = await rehydrateUploadsForAI(PROJECT_ID, parts)
    expect(result).toEqual(parts)
  })

  it('passes through non-file parts', async () => {
    const parts = [
      { type: 'text', text: 'Hello' },
    ]

    const result = await rehydrateUploadsForAI(PROJECT_ID, parts)
    expect(result).toEqual(parts)
  })

  it('keeps reference on missing file (graceful degradation)', async () => {
    const parts = [
      { type: 'file', mediaType: 'image/png', url: 'golemancy-upload:image/png:deadbeef12345678deadbeef12345678.png' },
    ]

    const result = await rehydrateUploadsForAI(PROJECT_ID, parts)
    // Should keep the original reference
    expect(result).toEqual(parts)
  })
})

describe('full roundtrip', () => {
  it('extract → resolve → rehydrate preserves image data', async () => {
    const originalParts = [
      { type: 'text', text: 'Check out this image' },
      { type: 'file', mediaType: 'image/png', url: TINY_PNG_DATA_URL, filename: 'test.png' },
    ]

    // Step 1: Extract (save to disk)
    const extracted = await extractUploads(PROJECT_ID, originalParts)
    const extractedFile = extracted[1] as Record<string, unknown>
    expect((extractedFile.url as string).startsWith('golemancy-upload:')).toBe(true)

    // Step 2: Resolve for client (convert to HTTP URL)
    const resolved = resolveUploadsForClient(PROJECT_ID, 'http://127.0.0.1:3456', extracted)
    const resolvedFile = resolved[1] as Record<string, unknown>
    expect((resolvedFile.url as string).startsWith('http://127.0.0.1:3456/api/')).toBe(true)

    // Step 3: Rehydrate for AI (convert HTTP URL back to data URL)
    const rehydrated = await rehydrateUploadsForAI(PROJECT_ID, resolved)
    const rehydratedFile = rehydrated[0] as Record<string, unknown>
    expect(rehydrated[0]).toEqual(originalParts[0]) // text unchanged

    const rehydratedImage = rehydrated[1] as Record<string, unknown>
    expect(rehydratedImage.url).toBe(TINY_PNG_DATA_URL)
    expect(rehydratedImage.filename).toBe('test.png')
    expect(rehydratedImage.mediaType).toBe('image/png')
  })
})
