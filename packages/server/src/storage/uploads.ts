import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { getProjectPath, validateId, validateFilePath } from '../utils/paths'
import { isNodeError } from './base'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:uploads' })

/** MIME type → file extension mapping */
const MIME_EXT_MAP: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff',
}

/** Upload reference protocol prefix */
const UPLOAD_REF_PREFIX = 'golemancy-upload:'

/** Strict filename pattern: 32 hex chars + extension */
const UPLOAD_FILENAME_PATTERN = /^[a-f0-9]{32}\.\w+$/

function getUploadsDir(projectId: string): string {
  return path.join(getProjectPath(projectId), 'uploads')
}

function getExtForMime(mediaType: string): string {
  return MIME_EXT_MAP[mediaType] ?? '.bin'
}

// ─── Data URL parsing ────────────────────────────────────────────────

export interface ParsedDataUrl {
  mediaType: string
  base64: string
}

/**
 * Parse a data URL into its MIME type and base64 content.
 * Returns null if the URL is not a valid base64 data URL.
 */
export function parseDataUrl(url: string): ParsedDataUrl | null {
  const match = url.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  return { mediaType: match[1], base64: match[2] }
}

// ─── Upload reference parsing ────────────────────────────────────────

export interface ParsedUploadRef {
  mediaType: string
  filename: string
}

/** Check if a URL is a golemancy-upload: reference */
export function isUploadRef(url: string): boolean {
  return url.startsWith(UPLOAD_REF_PREFIX)
}

/**
 * Parse a golemancy-upload reference.
 * Format: `golemancy-upload:{mediaType}:{filename}`
 */
export function parseUploadRef(url: string): ParsedUploadRef | null {
  if (!isUploadRef(url)) return null
  const rest = url.slice(UPLOAD_REF_PREFIX.length)
  // Split on last colon to get mediaType (may contain /) and filename
  const lastColon = rest.lastIndexOf(':')
  if (lastColon === -1) return null
  const mediaType = rest.slice(0, lastColon)
  const filename = rest.slice(lastColon + 1)
  if (!mediaType || !filename) return null
  return { mediaType, filename }
}

/** Build a golemancy-upload reference URL */
export function buildUploadRef(mediaType: string, filename: string): string {
  return `${UPLOAD_REF_PREFIX}${mediaType}:${filename}`
}

// ─── Disk operations ─────────────────────────────────────────────────

/**
 * Save a base64-encoded file to disk, deduplicating by content hash.
 * Returns the filename (hash + extension).
 */
export async function saveUploadFromBase64(
  projectId: string,
  mediaType: string,
  base64: string,
): Promise<string> {
  validateId(projectId)
  const buffer = Buffer.from(base64, 'base64')
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 32)
  const ext = getExtForMime(mediaType)
  const filename = `${hash}${ext}`

  const uploadsDir = getUploadsDir(projectId)
  const filePath = validateFilePath(uploadsDir, filename)

  // Dedup: skip write if file already exists
  try {
    await fs.access(filePath)
    log.debug({ projectId, filename }, 'upload already exists, skipping write')
    return filename
  } catch {
    // File doesn't exist, proceed to write
  }

  await fs.mkdir(uploadsDir, { recursive: true })
  await fs.writeFile(filePath, buffer)
  log.debug({ projectId, filename, size: buffer.length }, 'saved upload to disk')
  return filename
}

/**
 * Read an upload file and return as a data URL.
 */
export async function readUploadAsDataUrl(
  projectId: string,
  mediaType: string,
  filename: string,
): Promise<string> {
  validateId(projectId)
  const uploadsDir = getUploadsDir(projectId)
  const filePath = validateFilePath(uploadsDir, filename)

  const buffer = await fs.readFile(filePath)
  const base64 = buffer.toString('base64')
  return `data:${mediaType};base64,${base64}`
}

/**
 * Read the raw buffer of an upload file.
 * Returns { buffer, mediaType } inferred from extension.
 */
export async function readUploadBuffer(
  projectId: string,
  filename: string,
): Promise<{ buffer: Buffer; mediaType: string }> {
  validateId(projectId)
  const uploadsDir = getUploadsDir(projectId)
  const filePath = validateFilePath(uploadsDir, filename)

  const buffer = await fs.readFile(filePath)
  const ext = path.extname(filename)
  // Reverse lookup: extension → MIME type
  const mediaType = Object.entries(MIME_EXT_MAP).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream'
  return { buffer, mediaType }
}

/** Validate that a filename matches the expected upload pattern */
export function isValidUploadFilename(filename: string): boolean {
  return UPLOAD_FILENAME_PATTERN.test(filename)
}
