import path from 'node:path'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:file-parser' })

export interface ParseResult {
  text: string
  metadata?: Record<string, unknown>
}

/**
 * Parse a file buffer into text content.
 * Supported formats: PDF, DOCX, TXT, Markdown.
 */
export async function parseFile(buffer: Buffer, filename: string): Promise<ParseResult> {
  const ext = path.extname(filename).toLowerCase()

  switch (ext) {
    case '.pdf':
      return parsePdf(buffer, filename)
    case '.docx':
      return parseDocx(buffer, filename)
    case '.txt':
    case '.md':
    case '.markdown':
      return { text: buffer.toString('utf-8') }
    default:
      throw new Error(`Unsupported file type: ${ext}`)
  }
}

async function parsePdf(buffer: Buffer, filename: string): Promise<ParseResult> {
  log.debug({ filename, size: buffer.length }, 'parsing PDF')
  const { extractText, getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  try {
    const { totalPages, text } = await extractText(pdf, { mergePages: true })
    return {
      text: text as string,
      metadata: { totalPages },
    }
  } finally {
    pdf.destroy()
  }
}

async function parseDocx(buffer: Buffer, filename: string): Promise<ParseResult> {
  log.debug({ filename, size: buffer.length }, 'parsing DOCX')
  const mammoth = (await import('mammoth')).default
  const result = await mammoth.extractRawText({ buffer })
  return { text: result.value }
}
