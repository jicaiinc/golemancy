import { generateText, type LanguageModel, type ModelMessage, type UIMessage } from 'ai'
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

export async function compactConversation(opts: {
  messages: ModelMessage[]
  model: LanguageModel
  systemPrompt: string
  signal?: AbortSignal
}): Promise<{ summary: string; inputTokens: number; outputTokens: number }> {
  const compactPromptText = buildCompactPrompt(opts.systemPrompt)

  log.info({ messageCount: opts.messages.length }, 'starting conversation compaction')

  const result = await generateText({
    model: opts.model,
    system: 'You are a helpful AI assistant tasked with summarizing conversations.',
    messages: [...opts.messages, { role: 'user', content: compactPromptText }],
    abortSignal: opts.signal,
  })

  const parsed = parseSummary(result.text)
  const summary = parsed ?? result.text

  if (!parsed) {
    log.warn('failed to parse <summary> tags from compact response, using raw text')
  }

  const inputTokens = result.usage.inputTokens ?? 0
  const outputTokens = result.usage.outputTokens ?? 0

  log.info({ inputTokens, outputTokens }, 'compaction complete')

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
