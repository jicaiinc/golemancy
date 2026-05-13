import type { UIMessage } from 'ai'
import {
  parseDataUrl, isUploadRef, parseUploadRef, buildUploadRef,
  saveUploadFromBase64, readUploadAsDataUrl,
} from '../storage/uploads'
import { logger } from '../logger'

const log = logger.child({ component: 'message-parts' })

type Part = UIMessage['parts'][number]

/**
 * Pattern to extract upload filename from an HTTP URL.
 * Matches: /api/projects/{projectId}/uploads/{hash}.{ext}
 * IMPORTANT: Must stay in sync with the route path in routes/uploads.ts
 * and the URL format produced by resolveUploadsForClient.
 */
const UPLOAD_HTTP_URL_PATTERN = /\/api\/projects\/[^/]+\/uploads\/([a-f0-9]{32}\.\w+)$/

// ─── Transform 1: Extract (save to disk) ─────────────────────────────

/**
 * Extract base64 data URLs from file parts, save them to disk,
 * and replace with golemancy-upload: references.
 *
 * Non-file parts and already-extracted references pass through unchanged.
 * On write failure, keeps the original data URL (graceful degradation).
 */
export async function extractUploads(
  projectId: string,
  parts: unknown[],
): Promise<unknown[]> {
  const result: unknown[] = []

  for (const part of parts) {
    if (!isFilePart(part)) {
      result.push(part)
      continue
    }

    // Already a golemancy-upload reference — pass through
    if (isUploadRef(part.url)) {
      result.push(part)
      continue
    }

    // Parse data URL
    const parsed = parseDataUrl(part.url)
    if (!parsed) {
      // Not a data URL (e.g. HTTP URL) — pass through
      result.push(part)
      continue
    }

    try {
      const filename = await saveUploadFromBase64(projectId, parsed.mediaType, parsed.base64)
      result.push({
        ...part,
        url: buildUploadRef(parsed.mediaType, filename),
      })
    } catch (err) {
      log.warn({ err, projectId }, 'failed to save upload, keeping inline base64')
      result.push(part) // Graceful degradation: keep original data URL
    }
  }

  return result
}

// ─── Transform 2: Resolve for client (reference → HTTP URL) ──────────

/**
 * Convert golemancy-upload: references to HTTP URLs for client rendering.
 *
 * baseUrl should be the server's base URL (e.g. "http://127.0.0.1:3456").
 */
export function resolveUploadsForClient(
  projectId: string,
  baseUrl: string,
  parts: unknown[],
): unknown[] {
  return parts.map((part) => {
    if (!isFilePart(part)) return part
    if (!isUploadRef(part.url)) return part

    const ref = parseUploadRef(part.url)
    if (!ref) return part

    // IMPORTANT: URL path pattern must stay in sync with routes/uploads.ts
    // and UPLOAD_HTTP_URL_PATTERN above.
    const httpUrl = `${baseUrl}/api/projects/${projectId}/uploads/${ref.filename}`
    return { ...part, url: httpUrl }
  })
}

// ─── Transform 3: Rehydrate for AI (reference/HTTP URL → data URL) ───

/**
 * Convert golemancy-upload: references and HTTP URLs back to data URLs
 * for sending to AI models (which need actual image data).
 *
 * Handles three sources:
 * 1. golemancy-upload: references → read from disk → data URL
 * 2. HTTP URLs matching upload pattern → extract filename → read from disk → data URL
 * 3. Original data URLs → pass through unchanged
 */
export async function rehydrateUploadsForAI(
  projectId: string,
  parts: unknown[],
): Promise<unknown[]> {
  const result: unknown[] = []

  for (const part of parts) {
    if (!isFilePart(part)) {
      result.push(part)
      continue
    }

    // Case 1: golemancy-upload: reference
    if (isUploadRef(part.url)) {
      const ref = parseUploadRef(part.url)
      if (ref) {
        try {
          const dataUrl = await readUploadAsDataUrl(projectId, ref.mediaType, ref.filename)
          result.push({ ...part, url: dataUrl })
          continue
        } catch (err) {
          log.error({ err, projectId, filename: ref.filename }, 'upload file missing, skipping image for AI')
          // Keep the reference as-is; AI will ignore unresolvable URLs
          result.push(part)
          continue
        }
      }
    }

    // Case 2: HTTP URL matching upload pattern (roundtripped from client)
    const httpMatch = part.url.match(UPLOAD_HTTP_URL_PATTERN)
    if (httpMatch) {
      const filename = httpMatch[1]
      try {
        const dataUrl = await readUploadAsDataUrl(projectId, part.mediaType, filename)
        result.push({ ...part, url: dataUrl })
        continue
      } catch (err) {
        log.error({ err, projectId, filename }, 'upload file missing for HTTP URL, skipping image for AI')
        result.push(part)
        continue
      }
    }

    // Case 3: data URL or other — pass through
    result.push(part)
  }

  return result
}

// ─── Helpers ──────────────────────────────────────────────────────────

interface FilePartLike {
  type: 'file'
  mediaType: string
  url: string
  filename?: string
}

function isFilePart(part: unknown): part is FilePartLike {
  return (
    typeof part === 'object' &&
    part !== null &&
    (part as Record<string, unknown>).type === 'file' &&
    typeof (part as Record<string, unknown>).url === 'string' &&
    typeof (part as Record<string, unknown>).mediaType === 'string'
  )
}
