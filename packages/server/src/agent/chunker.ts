/**
 * Text chunking for Knowledge Base documents.
 *
 * Strategy: Recursive splitting with overlap.
 * Splits on paragraph boundaries (\n\n), then lines (\n), then sentences (. ),
 * targeting ~500 tokens per chunk with ~50 token overlap.
 *
 * Rough heuristic: 1 token ≈ 4 characters (English text average).
 */

const CHARS_PER_TOKEN = 4
const TARGET_CHUNK_TOKENS = 500
const OVERLAP_TOKENS = 50

const TARGET_CHUNK_CHARS = TARGET_CHUNK_TOKENS * CHARS_PER_TOKEN // ~2000
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN // ~200
const MIN_CHUNK_CHARS = 100

export interface TextChunk {
  content: string
  index: number
  charCount: number
}

/** Separators in order of priority — try the most structural first. */
const SEPARATORS = ['\n\n', '\n', '. ', ' ']

function splitBySeparator(text: string, separator: string): string[] {
  const parts = text.split(separator)
  // Re-attach the separator to maintain text integrity (except for the last part)
  return parts.map((part, i) =>
    i < parts.length - 1 ? part + separator : part,
  ).filter(p => p.length > 0)
}

function recursiveSplit(text: string, separatorIdx: number): string[] {
  if (text.length <= TARGET_CHUNK_CHARS) return [text]
  if (separatorIdx >= SEPARATORS.length) {
    // No more separators — hard-split by character limit
    const chunks: string[] = []
    for (let i = 0; i < text.length; i += TARGET_CHUNK_CHARS) {
      chunks.push(text.slice(i, i + TARGET_CHUNK_CHARS))
    }
    return chunks
  }

  const parts = splitBySeparator(text, SEPARATORS[separatorIdx])
  if (parts.length <= 1) {
    // This separator didn't split anything — try the next one
    return recursiveSplit(text, separatorIdx + 1)
  }

  // Merge small parts into target-sized chunks
  const chunks: string[] = []
  let current = ''

  for (const part of parts) {
    if (current.length + part.length > TARGET_CHUNK_CHARS && current.length > 0) {
      chunks.push(current)
      current = ''
    }
    // If a single part exceeds the target, recursively split it with the next separator
    if (part.length > TARGET_CHUNK_CHARS) {
      if (current.length > 0) {
        chunks.push(current)
        current = ''
      }
      chunks.push(...recursiveSplit(part, separatorIdx + 1))
    } else {
      current += part
    }
  }
  if (current.length > 0) chunks.push(current)

  return chunks
}

/**
 * Split text into chunks with overlap.
 * Short texts (< ~600 tokens) are returned as a single chunk.
 */
export function chunkText(text: string): TextChunk[] {
  const trimmed = text.trim()
  if (trimmed.length === 0) return []

  // Short text — single chunk
  if (trimmed.length <= TARGET_CHUNK_CHARS + OVERLAP_CHARS) {
    return [{ content: trimmed, index: 0, charCount: trimmed.length }]
  }

  const rawChunks = recursiveSplit(trimmed, 0)

  // Apply overlap: prepend the tail of the previous chunk
  const result: TextChunk[] = []
  for (let i = 0; i < rawChunks.length; i++) {
    let content = rawChunks[i]
    if (i > 0 && OVERLAP_CHARS > 0) {
      const prev = rawChunks[i - 1]
      const overlap = prev.slice(-OVERLAP_CHARS)
      content = overlap + content
    }
    if (content.length >= MIN_CHUNK_CHARS) {
      result.push({ content, index: result.length, charCount: content.length })
    } else if (result.length > 0) {
      // Merge tiny trailing chunk into the previous one
      const last = result[result.length - 1]
      last.content += content
      last.charCount = last.content.length
    } else {
      result.push({ content, index: 0, charCount: content.length })
    }
  }

  return result
}
