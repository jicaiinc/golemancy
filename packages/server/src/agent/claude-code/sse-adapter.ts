/**
 * SSE Adapter — Adapt SDK messages to UIMessageStream SSE events.
 *
 * Goal: **zero frontend changes** — reuse the existing SSE protocol
 * that the standard runtime already emits.
 *
 * SDK message types → SSE events:
 * - SDKSystemMessage (init)         → data-session (extract session_id)
 * - SDKPartialAssistantMessage      → text-delta / tool streaming
 *   (stream_event with content_block_delta)
 * - SDKAssistantMessage             → tool-input-available events (complete)
 * - SDKResultMessage                → data-usage + onFinish signal
 * - SDKCompactBoundaryMessage       → data-compact (completed)
 * - SDKStatusMessage (compacting)   → data-compact (started)
 * - SDKTask* messages               → data-subagent-* events
 * - Sub-agent messages              → data-subagent-* events
 */

import type { UIMessageStreamWriter } from 'ai'
import { logger } from '../../logger'

const log = logger.child({ component: 'claude-code:sse-adapter' })

// ── SDK Message Type Guards ──

/** Minimal SDK message shape — we use structural typing to avoid importing SDK types directly */
export interface SdkMessage {
  type: string
  subtype?: string
  session_id?: string
  uuid?: string
  parent_tool_use_id?: string | null
  // SDKSystemMessage fields
  tools?: string[]
  mcp_servers?: Array<{ name: string; status: string }>
  model?: string
  permissionMode?: string
  // SDKAssistantMessage fields
  message?: {
    content: Array<{
      type: string
      text?: string
      name?: string
      id?: string
      input?: unknown
    }>
  }
  // SDKPartialAssistantMessage (stream_event) fields
  event?: {
    type: string
    content_block?: {
      type: string
      name?: string
      id?: string
      text?: string
    }
    delta?: {
      type: string
      text?: string
      partial_json?: string
    }
  }
  // SDKResultMessage fields
  result?: string
  duration_ms?: number
  duration_api_ms?: number
  total_cost_usd?: number
  is_error?: boolean
  num_turns?: number
  usage?: { input_tokens: number; output_tokens: number }
  modelUsage?: Record<string, { inputTokens: number; outputTokens: number }>
  errors?: string[]
  // SDKCompactBoundaryMessage fields
  compact_metadata?: {
    trigger: 'manual' | 'auto'
    pre_tokens: number
  }
  // SDKStatusMessage fields
  status?: string | null
  // SDKTaskStarted/Progress/Notification fields
  task_id?: string
  tool_use_id?: string
  description?: string
  task_type?: string
  summary?: string
  output_file?: string
  last_tool_name?: string
}

// ── Adapter State ──

export interface SseAdapterState {
  sessionId?: string
  inputTokens: number
  outputTokens: number
  duration: number
  /** Auto-incrementing counter for generating text part IDs */
  textPartCounter: number
  /** Current text part ID (set on content_block_start for text blocks) */
  currentTextId?: string
  /** Accumulated main-agent text for message persistence */
  responseText: string
}

// ── Main Adapter ──

function nextPartId(state: SseAdapterState): string {
  return `sdk-part-${++state.textPartCounter}`
}

/**
 * Process a single SDK message and write corresponding SSE events to the writer.
 * Returns updated state.
 */
export function processSdkMessage(
  msg: SdkMessage,
  writer: UIMessageStreamWriter,
  state: SseAdapterState,
): SseAdapterState {
  const updated = { ...state }

  switch (msg.type) {
    case 'system': {
      processSystemMessage(msg, writer, updated)
      break
    }

    case 'stream_event': {
      processStreamEvent(msg, writer, updated)
      break
    }

    case 'assistant': {
      processAssistantMessage(msg, writer)
      break
    }

    case 'result': {
      processResultMessage(msg, writer, updated)
      break
    }

    default:
      // user, user_replay, tool_progress, etc. — not forwarded to SSE
      break
  }

  return updated
}

// ── System Message Processing ──

function processSystemMessage(
  msg: SdkMessage,
  writer: UIMessageStreamWriter,
  state: SseAdapterState,
): void {
  if (msg.subtype === 'init') {
    if (msg.session_id) {
      state.sessionId = msg.session_id
      writer.write({
        type: 'data-session' as `data-${string}`,
        data: {
          sessionId: msg.session_id,
          model: msg.model,
          tools: msg.tools,
          mcpServers: msg.mcp_servers,
          permissionMode: msg.permissionMode,
        },
      })
    }
    log.debug({ sessionId: msg.session_id, model: msg.model }, 'SDK session initialized')
  } else if (msg.subtype === 'compact_boundary') {
    writer.write({
      type: 'data-compact' as `data-${string}`,
      data: {
        status: 'completed',
        trigger: msg.compact_metadata?.trigger,
        preTokens: msg.compact_metadata?.pre_tokens,
      },
    })
    log.debug({ trigger: msg.compact_metadata?.trigger }, 'compact boundary')
  } else if (msg.subtype === 'status') {
    if (msg.status === 'compacting') {
      writer.write({
        type: 'data-compact' as `data-${string}`,
        data: { status: 'started' },
      })
    }
  } else if (msg.subtype === 'task_started') {
    writer.write({
      type: 'data-subagent-started' as `data-${string}`,
      data: {
        taskId: msg.task_id,
        toolUseId: msg.tool_use_id,
        description: msg.description,
        taskType: msg.task_type,
      },
    })
  } else if (msg.subtype === 'task_progress') {
    writer.write({
      type: 'data-subagent-progress' as `data-${string}`,
      data: {
        taskId: msg.task_id,
        toolUseId: msg.tool_use_id,
        description: msg.description,
        lastToolName: msg.last_tool_name,
      },
    })
  } else if (msg.subtype === 'task_notification') {
    writer.write({
      type: 'data-subagent-completed' as `data-${string}`,
      data: {
        taskId: msg.task_id,
        toolUseId: msg.tool_use_id,
        status: msg.status,
        summary: msg.summary,
      },
    })
  }
}

// ── Stream Event Processing ──

function processStreamEvent(
  msg: SdkMessage,
  writer: UIMessageStreamWriter,
  state: SseAdapterState,
): void {
  const event = msg.event
  if (!event) return

  const isSubAgent = !!msg.parent_tool_use_id

  if (event.type === 'content_block_start') {
    const block = event.content_block
    if (!block) return

    if (block.type === 'text') {
      // Start a new text block — generate a part ID for it
      const partId = nextPartId(state)
      state.currentTextId = partId
      if (!isSubAgent) {
        writer.write({ type: 'text-start', id: partId })
      }
    } else if (block.type === 'tool_use' && block.name) {
      if (isSubAgent) {
        writer.write({
          type: 'data-subagent-progress' as `data-${string}`,
          data: {
            parentToolUseId: msg.parent_tool_use_id,
            event: 'tool_start',
            toolName: block.name,
            toolUseId: block.id,
          },
        })
      } else if (block.id && block.name) {
        // Start streaming tool input
        writer.write({
          type: 'tool-input-start',
          toolCallId: block.id,
          toolName: block.name,
        })
      }
    }
  } else if (event.type === 'content_block_delta') {
    const delta = event.delta
    if (!delta) return

    if (delta.type === 'text_delta' && delta.text) {
      if (isSubAgent) {
        writer.write({
          type: 'data-subagent-delta' as `data-${string}`,
          data: {
            parentToolUseId: msg.parent_tool_use_id,
            text: delta.text,
          },
        })
      } else {
        // Main agent text — emit as text-delta and accumulate for persistence
        const partId = state.currentTextId ?? nextPartId(state)
        writer.write({ type: 'text-delta', delta: delta.text, id: partId })
        state.responseText += delta.text
      }
    } else if (delta.type === 'input_json_delta' && delta.partial_json) {
      if (isSubAgent) {
        writer.write({
          type: 'data-subagent-progress' as `data-${string}`,
          data: {
            parentToolUseId: msg.parent_tool_use_id,
            event: 'tool_input_delta',
            partialJson: delta.partial_json,
          },
        })
      }
      // For main agent, tool input streaming is handled via tool-input-delta
      // but we don't have toolCallId here — it comes from content_block_start
    }
  } else if (event.type === 'content_block_stop') {
    if (isSubAgent) {
      writer.write({
        type: 'data-subagent-progress' as `data-${string}`,
        data: {
          parentToolUseId: msg.parent_tool_use_id,
          event: 'block_stop',
        },
      })
    } else if (state.currentTextId) {
      writer.write({ type: 'text-end', id: state.currentTextId })
      state.currentTextId = undefined
    }
  }
}

// ── Assistant Message Processing ──

function processAssistantMessage(msg: SdkMessage, writer: UIMessageStreamWriter): void {
  const content = msg.message?.content
  if (!content) return

  const isSubAgent = !!msg.parent_tool_use_id

  if (isSubAgent) {
    // Sub-agent completed message — look for Task tool invocations
    const hasToolUse = content.some(block => block.type === 'tool_use')
    if (hasToolUse) {
      for (const block of content) {
        if (block.type === 'tool_use' && block.name === 'Task') {
          writer.write({
            type: 'data-subagent-started' as `data-${string}`,
            data: {
              parentToolUseId: msg.parent_tool_use_id,
              toolUseId: block.id,
              input: block.input,
            },
          })
        }
      }
    }

    // Sub-agent text content
    const textBlocks = content.filter(b => b.type === 'text' && b.text)
    if (textBlocks.length > 0) {
      const fullText = textBlocks.map(b => b.text).join('')
      writer.write({
        type: 'data-subagent-completed' as `data-${string}`,
        data: {
          parentToolUseId: msg.parent_tool_use_id,
          text: fullText,
        },
      })
    }
    return
  }

  // Main agent complete message — emit tool-input-available for each tool_use block
  for (const block of content) {
    if (block.type === 'tool_use' && block.name && block.id) {
      writer.write({
        type: 'tool-input-available',
        toolCallId: block.id,
        toolName: block.name,
        input: block.input ?? {},
      })
    }
  }
}

// ── Result Message Processing ──

function processResultMessage(
  msg: SdkMessage,
  writer: UIMessageStreamWriter,
  state: SseAdapterState,
): void {
  // Aggregate usage from modelUsage (preferred) or top-level usage
  let inputTokens = 0
  let outputTokens = 0

  if (msg.modelUsage) {
    for (const usage of Object.values(msg.modelUsage)) {
      inputTokens += usage.inputTokens ?? 0
      outputTokens += usage.outputTokens ?? 0
    }
  } else if (msg.usage) {
    inputTokens = msg.usage.input_tokens ?? 0
    outputTokens = msg.usage.output_tokens ?? 0
  }

  state.inputTokens = inputTokens
  state.outputTokens = outputTokens
  state.duration = msg.duration_ms ?? 0

  writer.write({
    type: 'data-usage' as `data-${string}`,
    data: {
      inputTokens,
      outputTokens,
      durationMs: msg.duration_ms,
      costUsd: msg.total_cost_usd,
      numTurns: msg.num_turns,
    },
  })

  if (msg.is_error && msg.errors?.length) {
    for (const err of msg.errors) {
      writer.write({
        type: 'error',
        errorText: `[SDK] ${err}`,
      })
    }
  }

  log.debug(
    { inputTokens, outputTokens, durationMs: msg.duration_ms, costUsd: msg.total_cost_usd },
    'SDK result processed',
  )
}
