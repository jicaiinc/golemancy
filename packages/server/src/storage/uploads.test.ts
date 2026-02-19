import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import {
  parseDataUrl, isUploadRef, parseUploadRef, buildUploadRef,
  saveUploadFromBase64, readUploadAsDataUrl, readUploadBuffer,
  isValidUploadFilename,
} from './uploads'

// Use a temp directory for test isolation
let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'golemancy-uploads-test-'))
  process.env.GOLEMANCY_DATA_DIR = tmpDir
})

afterEach(async () => {
  delete process.env.GOLEMANCY_DATA_DIR
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('parseDataUrl', () => {
  it('parses a valid PNG data URL', () => {
    const result = parseDataUrl('data:image/png;base64,iVBOR')
    expect(result).toEqual({ mediaType: 'image/png', base64: 'iVBOR' })
  })

  it('parses a valid JPEG data URL', () => {
    const result = parseDataUrl('data:image/jpeg;base64,/9j/4AAQ')
    expect(result).toEqual({ mediaType: 'image/jpeg', base64: '/9j/4AAQ' })
  })

  it('returns null for non-data URLs', () => {
    expect(parseDataUrl('http://example.com/img.png')).toBeNull()
    expect(parseDataUrl('golemancy-upload:image/png:abc.png')).toBeNull()
    expect(parseDataUrl('')).toBeNull()
  })

  it('returns null for non-base64 data URLs', () => {
    expect(parseDataUrl('data:text/plain,hello')).toBeNull()
  })
})

describe('upload reference utilities', () => {
  it('isUploadRef identifies golemancy-upload: URLs', () => {
    expect(isUploadRef('golemancy-upload:image/png:abc.png')).toBe(true)
    expect(isUploadRef('http://localhost:3000/img.png')).toBe(false)
    expect(isUploadRef('data:image/png;base64,xxx')).toBe(false)
  })

  it('parseUploadRef extracts mediaType and filename', () => {
    const result = parseUploadRef('golemancy-upload:image/png:a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6.png')
    expect(result).toEqual({
      mediaType: 'image/png',
      filename: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6.png',
    })
  })

  it('parseUploadRef handles MIME types with slashes', () => {
    const result = parseUploadRef('golemancy-upload:image/svg+xml:abc123.svg')
    expect(result).toEqual({
      mediaType: 'image/svg+xml',
      filename: 'abc123.svg',
    })
  })

  it('parseUploadRef returns null for invalid refs', () => {
    expect(parseUploadRef('http://example.com')).toBeNull()
    expect(parseUploadRef('golemancy-upload:')).toBeNull()
    expect(parseUploadRef('golemancy-upload:nocolon')).toBeNull()
  })

  it('buildUploadRef constructs correct format', () => {
    expect(buildUploadRef('image/png', 'abc.png')).toBe('golemancy-upload:image/png:abc.png')
  })

  it('roundtrips through build and parse', () => {
    const ref = buildUploadRef('image/jpeg', 'deadbeef12345678deadbeef12345678.jpg')
    const parsed = parseUploadRef(ref)
    expect(parsed).toEqual({
      mediaType: 'image/jpeg',
      filename: 'deadbeef12345678deadbeef12345678.jpg',
    })
  })
})

describe('isValidUploadFilename', () => {
  it('accepts valid filenames', () => {
    expect(isValidUploadFilename('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4.png')).toBe(true)
    expect(isValidUploadFilename('deadbeef12345678deadbeef12345678.jpg')).toBe(true)
  })

  it('rejects path traversal', () => {
    expect(isValidUploadFilename('../../etc/passwd')).toBe(false)
    expect(isValidUploadFilename('../secret.png')).toBe(false)
  })

  it('rejects non-hex filenames', () => {
    expect(isValidUploadFilename('not-a-hex-hash.png')).toBe(false)
    expect(isValidUploadFilename('abc.png')).toBe(false) // too short
  })

  it('rejects empty or missing extension', () => {
    expect(isValidUploadFilename('')).toBe(false)
    expect(isValidUploadFilename('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')).toBe(false)
  })
})

describe('disk operations', () => {
  const PROJECT_ID = 'proj-testUpload001'
  // A small 1x1 pixel red PNG
  const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='

  beforeEach(async () => {
    // Create project directory structure
    await fs.mkdir(path.join(tmpDir, 'projects', PROJECT_ID), { recursive: true })
  })

  describe('saveUploadFromBase64', () => {
    it('saves a file and returns a hash-based filename', async () => {
      const filename = await saveUploadFromBase64(PROJECT_ID, 'image/png', TINY_PNG_BASE64)

      expect(filename).toMatch(/^[a-f0-9]{32}\.png$/)

      // Verify file exists
      const filePath = path.join(tmpDir, 'projects', PROJECT_ID, 'uploads', filename)
      const stat = await fs.stat(filePath)
      expect(stat.isFile()).toBe(true)
    })

    it('deduplicates by content hash', async () => {
      const filename1 = await saveUploadFromBase64(PROJECT_ID, 'image/png', TINY_PNG_BASE64)
      const filename2 = await saveUploadFromBase64(PROJECT_ID, 'image/png', TINY_PNG_BASE64)

      expect(filename1).toBe(filename2)
    })

    it('uses correct extension for different MIME types', async () => {
      const filename = await saveUploadFromBase64(PROJECT_ID, 'image/jpeg', TINY_PNG_BASE64)
      expect(filename).toMatch(/\.jpg$/)
    })

    it('generates correct SHA-256 hash', async () => {
      const buffer = Buffer.from(TINY_PNG_BASE64, 'base64')
      const expectedHash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 32)

      const filename = await saveUploadFromBase64(PROJECT_ID, 'image/png', TINY_PNG_BASE64)
      expect(filename).toBe(`${expectedHash}.png`)
    })
  })

  describe('readUploadAsDataUrl', () => {
    it('reads a saved file as a data URL', async () => {
      const filename = await saveUploadFromBase64(PROJECT_ID, 'image/png', TINY_PNG_BASE64)
      const dataUrl = await readUploadAsDataUrl(PROJECT_ID, 'image/png', filename)

      expect(dataUrl).toBe(`data:image/png;base64,${TINY_PNG_BASE64}`)
    })

    it('throws for non-existent file', async () => {
      await expect(
        readUploadAsDataUrl(PROJECT_ID, 'image/png', 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4.png'),
      ).rejects.toThrow()
    })
  })

  describe('readUploadBuffer', () => {
    it('reads raw buffer and infers MIME type', async () => {
      const filename = await saveUploadFromBase64(PROJECT_ID, 'image/png', TINY_PNG_BASE64)
      const result = await readUploadBuffer(PROJECT_ID, filename)

      expect(result.mediaType).toBe('image/png')
      expect(Buffer.isBuffer(result.buffer)).toBe(true)
      expect(result.buffer.toString('base64')).toBe(TINY_PNG_BASE64)
    })
  })
})
