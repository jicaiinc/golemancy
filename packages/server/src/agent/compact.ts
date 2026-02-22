import { streamText, type LanguageModel, type ModelMessage, type UIMessage } from 'ai'
import type { CompactRecord } from '@golemancy/shared'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:compact' })

export function buildCompactPrompt(agentSystemPrompt?: string): string {
  let prompt = `Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and the assistant's actions.
This summary should be thorough in capturing technical details, code patterns, and architectural decisions that would be essential for continuing development work without losing context.

Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts and ensure you've covered all necessary points. In your analysis process:

1. Chronologically analyze each message and section of the conversation. For each section thoroughly identify:
   - The user's explicit requests and intents
   - Your approach to addressing the user's requests
   - Key decisions, technical concepts and code patterns
   - Specific details like file names, code snippets, function signatures, file edits
   - Errors that you ran into and how you fixed them
   - Pay special attention to specific user feedback that you received, especially if the user told you to do something differently
2. Double-check for technical accuracy and completeness.

Your summary should include the following sections:

1. Primary Request and Intent: Capture all of the user's explicit requests and intents in detail
2. Key Technical Concepts: List all important technical concepts, technologies, and frameworks discussed
3. Files and Code Sections: Enumerate specific files and code sections examined, modified, or created. Include code snippets where applicable and a summary of why each file is important.
4. Errors and Fixes: List all errors encountered and how they were fixed. Include user feedback on errors if any.
5. Pending Tasks: Outline any pending tasks explicitly asked to work on
6. Current Work: Describe precisely what was being worked on immediately before this summary request, including file names and code snippets where applicable.
7. Optional Next Step: List the next step related to the most recent work. Ensure it is directly in line with the user's most recent explicit requests. If the last task was concluded, only list next steps if explicitly requested.

IMPORTANT: Do NOT use any tools. You MUST respond with ONLY the <summary>...</summary> block as your text output.`

  if (agentSystemPrompt) {
    prompt += `

For additional context, here is the agent's system prompt that was used during this conversation:

<agent-system-prompt>
${agentSystemPrompt}
</agent-system-prompt>`
  }

  return prompt
}

export function parseSummary(response: string): string | null {
  const match = response.match(/<summary>([\s\S]*?)<\/summary>/)
  if (!match) return null

  let content = match[1]
  content = content.replace(/<analysis>[\s\S]*?<\/analysis>/g, '')
  return content.trim() || null
}

export class CompactFailedError extends Error {
  constructor(
    message: string,
    public readonly diagnostics: {
      finishReason: string
      inputTokens: number
      outputTokens: number
      textLength: number
      textPreview: string
      messageCount: number
      messageRoles: string[]
    },
  ) {
    super(message)
    this.name = 'CompactFailedError'
  }
}

export async function compactConversation(opts: {
  messages: ModelMessage[]
  model: LanguageModel
  systemPrompt: string
  signal?: AbortSignal
  onProgress?: (info: { generatedChars: number }) => void
}): Promise<{ summary: string; inputTokens: number; outputTokens: number }> {
  const compactPromptText = buildCompactPrompt(opts.systemPrompt)

  const messageRoles = opts.messages.map(m => m.role)
  log.info({
    messageCount: opts.messages.length,
    messageRoles,
    systemPromptLength: opts.systemPrompt.length,
    compactPromptLength: compactPromptText.length,
  }, 'starting conversation compaction')

  // Use streamText (streamGenerateContent endpoint) instead of generateText (generateContent)
  // — Gemini 2.5 Flash has a known bug returning empty responses on the non-streaming endpoint
  const result = streamText({
    model: opts.model,
    system: 'You are a helpful AI assistant tasked with summarizing conversations.',
    messages: [...opts.messages, { role: 'user', content: compactPromptText }],
    abortSignal: opts.signal,
  })

  // Consume the stream to build the full text and report progress
  let text = ''
  for await (const chunk of result.textStream) {
    text += chunk
    opts.onProgress?.({ generatedChars: text.length })
  }

  const usage = await result.totalUsage
  const inputTokens = usage.inputTokens ?? 0
  const outputTokens = usage.outputTokens ?? 0
  const finishReason = await result.finishReason

  log.info({
    finishReason,
    inputTokens,
    outputTokens,
    textLength: text.length,
    textPreview: text.slice(0, 200),
  }, 'streamText completed for compact')

  if (outputTokens === 0 || !text.trim()) {
    const diagnostics = {
      finishReason,
      inputTokens,
      outputTokens,
      textLength: text.length,
      textPreview: text.slice(0, 500),
      messageCount: opts.messages.length,
      messageRoles,
    }
    log.error(diagnostics, 'compact failed: model returned empty response')
    throw new CompactFailedError(
      `Compact failed: model returned empty response (finishReason=${finishReason}, outputTokens=${outputTokens})`,
      diagnostics,
    )
  }

  const parsed = parseSummary(text)

  if (!parsed) {
    log.warn({
      textLength: text.length,
      textPreview: text.slice(0, 500),
      finishReason,
    }, 'failed to parse <summary> tags from compact response, using raw text as fallback')
  }

  const summary = parsed || text

  log.info({ inputTokens, outputTokens, summaryLength: summary.length }, 'compaction complete')

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

  const summaryText = `[Previous conversation summary]

${latestCompact.summary}

[Recent messages follow below]`

  const summaryMessage: UIMessage = {
    id: 'compact-summary',
    role: 'user',
    parts: [{ type: 'text', text: summaryText }],
  }

  return [summaryMessage, ...recentMessages]
}
