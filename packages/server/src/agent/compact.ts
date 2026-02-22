import { streamText, type LanguageModel, type ModelMessage, type UIMessage } from 'ai'
import type { CompactRecord } from '@golemancy/shared'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:compact' })

const COMPACT_PROMPT = `Summarize this conversation so a future assistant can continue seamlessly. Be concise but preserve:

- User's requests and intent
- Key decisions and their reasoning
- File paths, code snippets, and technical details that were discussed or modified
- Errors encountered and how they were resolved
- Any pending or unfinished tasks
- What was being worked on most recently

Do not call any tools. Output only the summary text, no extra formatting.`

export async function compactConversation(opts: {
  messages: ModelMessage[]
  model: LanguageModel
  systemPrompt: string
  signal?: AbortSignal
  onProgress?: (info: { generatedChars: number }) => void
}): Promise<{ summary: string; inputTokens: number; outputTokens: number }> {
  log.info({ messageCount: opts.messages.length }, 'starting compact')

  const result = streamText({
    model: opts.model,
    system: opts.systemPrompt,
    messages: [...opts.messages, { role: 'user', content: COMPACT_PROMPT }],
    abortSignal: opts.signal,
  })

  let text = ''
  for await (const chunk of result.textStream) {
    text += chunk
    opts.onProgress?.({ generatedChars: text.length })
  }

  const usage = await result.totalUsage
  const inputTokens = usage.inputTokens ?? 0
  const outputTokens = usage.outputTokens ?? 0

  log.info({ inputTokens, outputTokens, textLength: text.length }, 'compact streamText done')

  if (!text.trim()) {
    throw new Error(`Compact failed: model returned empty response (finishReason=${await result.finishReason})`)
  }

  return { summary: text.trim(), inputTokens, outputTokens }
}

export function buildMessagesForModel(
  allMessages: UIMessage[],
  latestCompact: CompactRecord | null,
): UIMessage[] {
  if (!latestCompact) return allMessages

  const boundaryIndex = allMessages.findIndex(m => m.id === latestCompact.boundaryMessageId)
  if (boundaryIndex === -1) {
    log.warn(
      { boundaryMessageId: latestCompact.boundaryMessageId },
      'compact boundary message not found, returning all messages',
    )
    return allMessages
  }

  const recentMessages = allMessages.slice(boundaryIndex + 1)

  const summaryMessage: UIMessage = {
    id: 'compact-summary',
    role: 'user',
    parts: [{ type: 'text', text: `[Previous conversation summary]\n\n${latestCompact.summary}\n\n[Recent messages follow below]` }],
  }

  return [summaryMessage, ...recentMessages]
}
