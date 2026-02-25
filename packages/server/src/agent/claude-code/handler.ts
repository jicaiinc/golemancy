/**
 * Claude Code SDK Handler — Main entry point for the claude-code agent runtime.
 *
 * Accepts agent config + user message, calls the SDK's `query()` function,
 * and streams SDK messages through the SSE adapter into UIMessageStreamWriter.
 *
 * Key difference from the standard runtime: the SDK manages its own context
 * via session resume, so we only send the latest user message (not full history).
 */

import { query } from '@anthropic-ai/claude-agent-sdk'
import type { UIMessageStreamWriter } from 'ai'
import type { Agent, MCPServerConfig, PermissionMode } from '@golemancy/shared'
import { buildSdkOptions } from './config-mapper'
import { processSdkMessage, type SseAdapterState, type SdkMessage } from './sse-adapter'
import { logger } from '../../logger'

const log = logger.child({ component: 'claude-code:handler' })

// ── SDK Content Block Types ──

/** SDK-compatible content block types */
export type SDKTextBlock = {
  type: 'text'
  text: string
}

export type SDKImageBlock = {
  type: 'image'
  source: {
    type: 'base64'
    media_type: string
    data: string
  }
}

export type SDKContentBlock = SDKTextBlock | SDKImageBlock

// ── Public Interface ──

export interface ClaudeCodeChatParams {
  agent: Agent
  contentBlocks: SDKContentBlock[]
  sdkSessionId?: string
  systemPrompt: string
  cwd?: string
  permissionMode?: PermissionMode | string
  allAgents: Agent[]
  mcpConfigs: MCPServerConfig[]
  signal?: AbortSignal
  hasSkills?: boolean
}

export interface ClaudeCodeChatResult {
  sessionId?: string
  inputTokens: number
  outputTokens: number
  duration: number
  responseText: string
}

/**
 * Handle a Claude Code SDK chat stream.
 *
 * 1. Builds SDK options from agent config
 * 2. Calls `query()` to start/resume an SDK session
 * 3. Consumes the AsyncGenerator<SDKMessage> stream
 * 4. Writes adapted SSE events via the writer
 * 5. Returns extracted metadata (sessionId, usage)
 */
export async function handleClaudeCodeStream(
  params: ClaudeCodeChatParams,
  writer: UIMessageStreamWriter,
): Promise<ClaudeCodeChatResult> {
  const {
    agent, contentBlocks, sdkSessionId, systemPrompt,
    cwd, permissionMode, allAgents, mcpConfigs, signal, hasSkills,
  } = params

  log.info(
    { agentId: agent.id, agentName: agent.name, hasSession: !!sdkSessionId },
    'starting Claude Code SDK stream',
  )

  // Build SDK options from Golemancy agent config
  const sdkOptions = buildSdkOptions({
    agent,
    systemPrompt,
    cwd,
    permissionMode,
    allAgents,
    mcpConfigs,
    sdkSessionId,
    hasSkills,
  })

  // Merge with SDK-specific options (abortController etc.)
  // We cast to the SDK's Options type since buildSdkOptions returns a compatible subset
  const options: Record<string, unknown> = { ...sdkOptions }

  // Set up abort handling
  if (signal) {
    const ac = new AbortController()
    signal.addEventListener('abort', () => ac.abort(), { once: true })
    options.abortController = ac
  }

  // Track adapter state across messages
  let state: SseAdapterState = {
    sessionId: undefined,
    inputTokens: 0,
    outputTokens: 0,
    duration: 0,
    textPartCounter: 0,
    responseText: '',
  }

  try {
    // Always use streaming input mode for multimodal support (content blocks)
    const sdkQuery = query({
      prompt: createUserMessageGenerator(contentBlocks),
      options: options as Parameters<typeof query>[0]['options'],
    })

    // Consume the SDK message stream
    for await (const message of sdkQuery) {
      // Check abort before processing
      if (signal?.aborted) {
        log.debug('stream aborted by signal')
        break
      }

      state = processSdkMessage(message as SdkMessage, writer, state)
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    log.error({ err: errorMessage, agentId: agent.id }, 'SDK stream error')

    writer.write({
      type: 'error',
      errorText: `Claude Code SDK error: ${errorMessage}`,
    })
  }

  log.info(
    {
      agentId: agent.id,
      sessionId: state.sessionId,
      inputTokens: state.inputTokens,
      outputTokens: state.outputTokens,
      durationMs: state.duration,
    },
    'Claude Code SDK stream completed',
  )

  return {
    sessionId: state.sessionId,
    inputTokens: state.inputTokens,
    outputTokens: state.outputTokens,
    duration: state.duration,
    responseText: state.responseText,
  }
}

// ── Helpers ──

/**
 * Create an AsyncGenerator that yields a single user message with content blocks.
 * Always used for streaming input mode to support multimodal content (text + images).
 *
 * The SDK types require session_id and parent_tool_use_id, but these
 * are filled in by the SDK process — we provide placeholder values.
 */
async function* createUserMessageGenerator(contentBlocks: SDKContentBlock[]) {
  yield {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: contentBlocks,
    },
    parent_tool_use_id: null,
    session_id: '',
  }
}
