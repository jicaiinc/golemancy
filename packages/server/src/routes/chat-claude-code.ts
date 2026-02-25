/**
 * Chat Route — Claude Code SDK path.
 *
 * Handles chat requests when `agentRuntime === 'claude-code'`.
 * Called from the main chat route after runtime resolution.
 *
 * Key difference from standard runtime:
 * - SDK manages its own context, tools, and multi-turn loops
 * - We only send the latest user message (not full history)
 * - Session resume is handled via sdkSessionId on Conversation
 * - MCP configs are forwarded to the SDK for native handling
 */

import {
  createUIMessageStream, createUIMessageStreamResponse,
  type UIMessage,
} from 'ai'
import type {
  Agent, AgentId, ConversationId, MessageId, ProjectId, Project, GlobalSettings,
  PermissionsConfigId, SupportedPlatform,
  IConversationService,
} from '@golemancy/shared'
import type { ChatRouteDeps } from './chat'
import { handleClaudeCodeStream, type ClaudeCodeChatResult, type SDKContentBlock, type SDKTextBlock } from '../agent/claude-code/handler'
import { syncSkillsToSdkDir } from '../agent/claude-code/skills-sync'
import { resolvePermissionsConfig } from '../agent/resolve-permissions'
import { getProjectPath } from '../utils/paths'
import { generateId } from '../utils/ids'
import { extractUploads, rehydrateUploadsForAI } from '../utils/message-parts'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:chat-claude-code' })

/**
 * Extract content parts from UIMessage parts for SDK consumption.
 * Returns SDK-compatible content blocks (text + image).
 */
async function extractContentParts(
  projectId: string,
  parts: UIMessage['parts'],
): Promise<SDKContentBlock[]> {
  const rehydrated = await rehydrateUploadsForAI(projectId, parts as unknown[])
  const blocks: SDKContentBlock[] = []

  for (const part of rehydrated) {
    const p = part as Record<string, unknown>

    if (p.type === 'text' && typeof p.text === 'string') {
      blocks.push({ type: 'text', text: p.text })
      continue
    }

    if (p.type === 'file' && typeof p.url === 'string' && typeof p.mediaType === 'string') {
      const mediaType = p.mediaType as string
      if (!mediaType.startsWith('image/')) {
        log.warn({ mediaType }, 'non-image file part in claude-code mode, skipping')
        continue
      }

      const parsed = parseBase64DataUrl(p.url as string)
      if (!parsed) {
        log.warn({ mediaType }, 'failed to parse data URL for image, skipping')
        continue
      }

      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: parsed.mediaType,
          data: parsed.data,
        },
      })
    }
  }

  return blocks
}

function parseBase64DataUrl(url: string): { mediaType: string; data: string } | null {
  const match = url.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  return { mediaType: match[1], data: match[2] }
}

/** Extended conversation storage type — includes SDK-specific methods from the concrete implementation */
type ConversationStorageWithSdk = IConversationService & {
  updateSdkSessionId?(projectId: ProjectId, conversationId: ConversationId, sessionId: string): Promise<void>
}

export interface ClaudeCodeChatParams {
  messages: UIMessage[]
  projectId: string
  agentId: string
  conversationId?: string
  agent: Agent
  project: Project | null
  settings: GlobalSettings
}

/**
 * Handle a claude-code chat request. Returns an SSE streaming Response.
 */
export async function handleClaudeCodeChat(
  c: { req: { raw: { signal: AbortSignal } } },
  params: ClaudeCodeChatParams,
  deps: ChatRouteDeps,
): Promise<Response> {
  const { messages, projectId, agentId, conversationId, agent, project, settings } = params

  // Extract the latest user message content blocks (text + images)
  const lastUserMsg = messages.filter(m => m.role === 'user').at(-1)
  if (!lastUserMsg) {
    throw new Error('No user message found')
  }
  const contentBlocks = await extractContentParts(projectId, lastUserMsg.parts)

  // Extract plain text for FTS indexing / content field
  const userTextContent = contentBlocks
    .filter((b): b is SDKTextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')

  // Look up sdkSessionId from existing conversation
  let sdkSessionId: string | undefined
  if (conversationId) {
    const conv = await deps.conversationStorage.getById(
      projectId as ProjectId,
      conversationId as ConversationId,
    )
    sdkSessionId = conv?.sdkSessionId
  }

  log.info(
    { projectId, agentId, conversationId, hasSession: !!sdkSessionId },
    'starting claude-code chat',
  )

  // Save user message before streaming (extract base64 uploads to disk)
  if (conversationId) {
    try {
      const extractedParts = await extractUploads(projectId, lastUserMsg.parts)
      lastUserMsg.parts = extractedParts as UIMessage['parts']
      await deps.conversationStorage.saveMessage(
        projectId as ProjectId,
        conversationId as ConversationId,
        {
          id: lastUserMsg.id as MessageId,
          role: 'user',
          parts: extractedParts,
          content: userTextContent,
        },
      )
    } catch (err) {
      log.error({ err, conversationId }, 'failed to save user message')
    }
  }

  // Resolve MCP configs for the SDK
  const mcpConfigs = agent.mcpServers?.length > 0
    ? await deps.mcpStorage.resolveNames(projectId as ProjectId, agent.mcpServers)
    : []

  // Load all agents (needed for sub-agent config mapping)
  const allAgents = agent.subAgents?.length > 0
    ? await deps.agentStorage.list(projectId as ProjectId)
    : []

  // Resolve skill IDs: project-level first, fallback to agent-level (migration compat)
  const skillIds = project?.config?.skillIds?.length
    ? project.config.skillIds
    : (agent.skillIds ?? [])

  // Workspace directory — SDK CLI subprocess cwd
  const workspaceDir = getProjectPath(projectId) + '/workspace'

  // Claude Code mode: sync skills to filesystem for SDK native discovery
  let systemPrompt = agent.systemPrompt
  let skillCleanup: (() => Promise<void>) | undefined
  let hasSkills = false

  if (skillIds.length > 0) {
    try {
      const { cleanup } = await syncSkillsToSdkDir(projectId, skillIds as string[], workspaceDir)
      skillCleanup = cleanup
      hasSkills = true
    } catch (err) {
      log.warn({ err, projectId }, 'failed to sync skills to SDK directory')
    }
  }

  // Resolve permission mode from project's permissions config
  let permissionMode: string | undefined
  if (project?.config?.permissionsConfigId || deps.permissionsConfigStorage) {
    try {
      const platform = process.platform as SupportedPlatform
      const resolved = await resolvePermissionsConfig(
        deps.permissionsConfigStorage,
        projectId as ProjectId,
        project?.config?.permissionsConfigId as PermissionsConfigId | undefined,
        workspaceDir,
        platform,
      )
      permissionMode = resolved.mode
    } catch (err) {
      log.warn({ err, projectId }, 'failed to resolve permissions for claude-code, using default')
    }
  }

  // --- Agent status lifecycle: mark running ---
  const chatConvId = conversationId ?? 'ephemeral'
  try {
    if (deps.activeChatRegistry) {
      deps.activeChatRegistry.register(chatConvId, { agentId, projectId })
    }
    await deps.agentStorage.update(projectId as ProjectId, agentId as AgentId, { status: 'running' })
    if (deps.wsManager) {
      deps.wsManager.emit(`project:${projectId}`, { event: 'agent:status_changed', agentId: agentId as AgentId, status: 'running' })
      deps.wsManager.emit(`project:${projectId}`, { event: 'runtime:chat_started', projectId, agentId: agentId as AgentId, conversationId: conversationId as ConversationId | undefined })
    }
  } catch (err) {
    log.warn({ err, agentId }, 'failed to set agent running status')
  }

  const markChatEnded = async () => {
    try {
      if (deps.activeChatRegistry) {
        deps.activeChatRegistry.unregister(chatConvId)
        const remaining = deps.activeChatRegistry.countByAgent(agentId)
        if (remaining === 0) {
          await deps.agentStorage.update(projectId as ProjectId, agentId as AgentId, { status: 'idle' })
          if (deps.wsManager) {
            deps.wsManager.emit(`project:${projectId}`, { event: 'agent:status_changed', agentId: agentId as AgentId, status: 'idle' })
          }
        }
      } else {
        await deps.agentStorage.update(projectId as ProjectId, agentId as AgentId, { status: 'idle' })
        if (deps.wsManager) {
          deps.wsManager.emit(`project:${projectId}`, { event: 'agent:status_changed', agentId: agentId as AgentId, status: 'idle' })
        }
      }
      if (deps.wsManager) {
        deps.wsManager.emit(`project:${projectId}`, { event: 'runtime:chat_ended', projectId, agentId: agentId as AgentId, conversationId: conversationId as ConversationId | undefined })
      }
    } catch (err) {
      log.warn({ err, agentId }, 'failed to set agent idle status')
    }
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      let sdkResult: ClaudeCodeChatResult | undefined

      try {
        sdkResult = await handleClaudeCodeStream(
          {
            agent,
            contentBlocks,
            sdkSessionId,
            systemPrompt,
            cwd: workspaceDir,
            permissionMode,
            allAgents,
            mcpConfigs,
            signal: c.req.raw.signal,
            hasSkills,
          },
          writer,
        )
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        log.error({ err: errorMessage, agentId }, 'claude-code chat stream error')
        writer.write({
          type: 'error',
          errorText: `Claude Code error: ${errorMessage}`,
        })
      }

      // --- onFinish: save assistant message + tokens + sdkSessionId ---
      if (sdkResult) {
        const { sessionId: newSessionId, inputTokens, outputTokens, responseText } = sdkResult

        // Save assistant message
        if (conversationId) {
          try {
            const assistantMsgId = generateId('msg')
            const displayText = responseText || '[Claude Code SDK response]'
            await deps.conversationStorage.saveMessage(
              projectId as ProjectId,
              conversationId as ConversationId,
              {
                id: assistantMsgId as MessageId,
                role: 'assistant',
                parts: [{ type: 'text', text: displayText }],
                content: displayText,
                inputTokens,
                outputTokens,
                provider: 'anthropic',
                model: agent.modelConfig?.model ?? 'claude-code',
              },
            )
            log.debug({ conversationId, inputTokens, outputTokens }, 'saved claude-code assistant message')
          } catch (err) {
            log.error({ err, conversationId }, 'failed to save assistant message')
          }

          // Update sdkSessionId on conversation
          if (newSessionId) {
            try {
              const storage = deps.conversationStorage as ConversationStorageWithSdk
              if (typeof storage.updateSdkSessionId === 'function') {
                await storage.updateSdkSessionId(
                  projectId as ProjectId,
                  conversationId as ConversationId,
                  newSessionId,
                )
              }
            } catch (err) {
              log.error({ err, conversationId, sessionId: newSessionId }, 'failed to update sdkSessionId')
            }
          }
        }

        // Save token record
        try {
          deps.tokenRecordStorage.save(projectId as ProjectId, {
            conversationId,
            agentId,
            provider: 'anthropic',
            model: agent.modelConfig?.model ?? 'claude-code',
            inputTokens,
            outputTokens,
            source: 'chat',
          })
          if (deps.wsManager) {
            deps.wsManager.emit(`project:${projectId}`, {
              event: 'token:recorded', projectId,
              agentId: agentId as AgentId,
              model: agent.modelConfig?.model ?? 'claude-code',
              inputTokens, outputTokens,
            })
          }
        } catch (err) {
          log.error({ err, conversationId }, 'failed to save token record')
        }

        // Emit final usage data to client
        writer.write({
          type: 'data-usage' as `data-${string}`,
          data: { inputTokens, outputTokens },
        })
      }

      await markChatEnded()

      // Cleanup skill temp directory
      if (skillCleanup) {
        await skillCleanup().catch(() => {})
      }
    },
  })

  return createUIMessageStreamResponse({ stream })
}
