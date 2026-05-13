import { streamText, type ModelMessage, type UIMessage } from 'ai'
import type { CompactRecord } from '@golemancy/shared'
import { type ResolvedModel, buildSystemPromptOptions } from './model'
import { wrapModelForAnalytics } from '../telemetry/ai-telemetry'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:compact' })

/** Simplified system prompt — avoids tool instructions leaking into summary context. */
const COMPACT_SYSTEM = 'You are a conversation summarizer. You do not have access to any tools. Respond with text only.'

const COMPACT_PROMPT = `CRITICAL: Respond with TEXT ONLY. Do NOT call any tools or functions.

Summarize this conversation so a future assistant can continue seamlessly.
Think through what matters in <analysis> tags, then produce a structured summary in <summary> tags.

First, analyze inside <analysis> tags (this section will be stripped from the final output):

<analysis>
Review the conversation and identify:
- What was the user trying to accomplish overall?
- What key technical decisions were made and why?
- What files were read, created, or modified?
- What errors occurred and how were they resolved?
- What remains pending or in progress?
</analysis>

Then produce your summary inside <summary> tags, using these sections (omit any that don't apply):

<summary>
## Primary Request and Intent
What the user asked for and the overall goal.

## Key Technical Concepts
Important technical details, patterns, architecture decisions discussed.

## Files and Code Sections
Files read, created, or modified — include paths and brief description of changes.

## Errors and Fixes
Problems encountered and how they were resolved.

## Problem Solving
Approaches tried, trade-offs evaluated, reasoning behind choices.

## Key Decisions
Decisions made during the conversation and their rationale.

## Pending Tasks
Unfinished work, known issues, or remaining work items.

## Current Work and Next Steps
What was being worked on most recently. Suggest what should happen next.
</summary>

REMINDER: Do NOT call any tools. Respond with ONLY the <analysis> and <summary> blocks as plain text.`

/**
 * Extract the <summary> content from compact output, stripping the <analysis> block.
 * Falls back to raw text (minus analysis) if <summary> tags are missing.
 */
export function formatCompactSummary(raw: string): string {
  const summaryMatch = raw.match(/<summary>([\s\S]*?)<\/summary>/)
  if (summaryMatch) {
    return summaryMatch[1].trim()
  }
  // Fallback: strip <analysis> block if present, return rest
  const stripped = raw.replace(/<analysis>[\s\S]*?<\/analysis>/g, '').trim()
  return stripped || raw.trim()
}

export async function compactConversation(opts: {
  messages: ModelMessage[]
  resolved: ResolvedModel
  /** @deprecated Ignored — compact now uses its own simplified system prompt. */
  systemPrompt?: string
  signal?: AbortSignal
  analyticsEnabled?: boolean
  distinctId?: string
  onProgress?: (info: { generatedChars: number }) => void
}): Promise<{ summary: string; inputTokens: number; outputTokens: number }> {
  log.info({ messageCount: opts.messages.length }, 'starting compact')

  const model = wrapModelForAnalytics(opts.resolved.model, {
    functionId: 'compact',
    analyticsEnabled: opts.analyticsEnabled,
    distinctId: opts.distinctId,
  })

  const result = streamText({
    model,
    ...buildSystemPromptOptions(opts.resolved, COMPACT_SYSTEM),
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

  const summary = formatCompactSummary(text)
  if (!summary) {
    throw new Error('Compact failed: model returned a response but the extracted summary is empty')
  }
  return { summary, inputTokens, outputTokens }
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
