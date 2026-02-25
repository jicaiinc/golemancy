import { streamText, stepCountIs, convertToModelMessages, type UIMessage, type UIMessageStreamWriter } from 'ai'
import type {
  Agent, CronJob, CronJobRun, GlobalSettings, Project, ProjectId,
  PermissionsConfigId, SupportedPlatform,
  IAgentService, IConversationService, ISettingsService, IMCPService, IPermissionsConfigService, IProjectService,
} from '@golemancy/shared'
import type { SqliteConversationTaskStorage } from '../storage/tasks'
import type { SqliteCronJobRunStorage } from '../storage/cron-job-runs'
import type { FileCronJobStorage } from '../storage/cronjobs'
import type { TokenRecordStorage } from '../storage/token-records'
import type { WebSocketManager } from '../ws/handler'
import type { ActiveChatRegistry } from '../agent/active-chat-registry'
import { resolveModel } from '../agent/model'
import { resolveAgentRuntime } from '../agent/resolve-runtime'
import { loadAgentTools } from '../agent/tools'
import { handleClaudeCodeStream, type SDKContentBlock } from '../agent/claude-code/handler'
import { syncSkillsToSdkDir } from '../agent/claude-code/skills-sync'
import { resolvePermissionsConfig } from '../agent/resolve-permissions'
import { getProjectPath } from '../utils/paths'
import { generateId } from '../utils/ids'
import { logger } from '../logger'

const log = logger.child({ component: 'scheduler:executor' })

export interface ExecutorDeps {
  agentStorage: IAgentService
  conversationStorage: IConversationService
  settingsStorage: ISettingsService
  mcpStorage: IMCPService
  permissionsConfigStorage: IPermissionsConfigService
  cronJobRunStorage: SqliteCronJobRunStorage
  cronJobStorage: FileCronJobStorage
  taskStorage: SqliteConversationTaskStorage
  projectStorage: IProjectService
  tokenRecordStorage: TokenRecordStorage
  wsManager?: WebSocketManager
  activeChatRegistry?: ActiveChatRegistry
}

export class CronJobExecutor {
  constructor(private deps: ExecutorDeps) {}

  async execute(cronJob: CronJob, triggeredBy: 'schedule' | 'manual'): Promise<CronJobRun> {
    const startTime = Date.now()
    const projectId = cronJob.projectId

    // 1. Create CronJobRun record
    const run = await this.deps.cronJobRunStorage.create(projectId, {
      cronJobId: cronJob.id,
      projectId,
      agentId: cronJob.agentId,
      status: 'running',
      triggeredBy,
    })

    // Mark cron job as running immediately
    await this.deps.cronJobStorage.updateRunMeta(projectId, cronJob.id, {
      lastRunAt: new Date().toISOString(),
      lastRunStatus: 'running',
      lastRunId: run.id,
    })

    // --- Agent status lifecycle: mark running ---
    try {
      await this.deps.agentStorage.update(projectId, cronJob.agentId, { status: 'running' })
      if (this.deps.wsManager) {
        this.deps.wsManager.emit(`project:${projectId}`, { event: 'agent:status_changed', agentId: cronJob.agentId, status: 'running' })
        this.deps.wsManager.emit(`project:${projectId}`, { event: 'runtime:cron_started', projectId, agentId: cronJob.agentId, cronJobId: cronJob.id })
      }
    } catch (err) {
      log.warn({ err, agentId: cronJob.agentId }, 'failed to set agent running status for cron')
    }

    try {
      // 2. Load agent config
      const agent = await this.deps.agentStorage.getById(projectId, cronJob.agentId)
      if (!agent) throw new Error(`Agent ${cronJob.agentId} not found`)

      // 3. Load global settings
      const settings = await this.deps.settingsStorage.get()

      // 3b. Check runtime — branch to claude-code if needed
      const project = await this.deps.projectStorage.getById(projectId)
      const agentRuntime = resolveAgentRuntime(settings, project?.config)

      if (agentRuntime === 'claude-code') {
        return await this.executeClaudeCode(cronJob, agent, settings, run, startTime, project)
      }

      // 4. Resolve model
      const model = await resolveModel(settings, agent.modelConfig)

      // 5. Create conversation
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const conv = await this.deps.conversationStorage.create(
        projectId,
        cronJob.agentId,
        `[Cron] ${cronJob.name} — ${timestamp}`,
        'standard',
      )
      const conversationId = conv.id

      // Update run with conversationId
      await this.deps.cronJobRunStorage.updateStatus(projectId, run.id, 'running', { conversationId })

      // 6. Build user message
      const userContent = cronJob.instruction || `[Scheduled: ${cronJob.name}] Execute your task.`
      const userMsgId = generateId('msg')
      await this.deps.conversationStorage.saveMessage(projectId, conversationId, {
        id: userMsgId,
        role: 'user',
        parts: [{ type: 'text', text: userContent }],
        content: userContent,
      })

      // 7. Load tools
      const allAgents = agent.subAgents?.length > 0
        ? await this.deps.agentStorage.list(projectId)
        : []

      // Resolve skill IDs: project-level first, fallback to agent-level (migration compat)
      const skillIds = project?.config?.skillIds?.length
        ? (project.config.skillIds as string[])
        : undefined

      const agentToolsResult = await loadAgentTools({
        agent,
        projectId,
        settings,
        allAgents,
        mcpStorage: this.deps.mcpStorage,
        permissionsConfigId: project?.config.permissionsConfigId,
        permissionsConfigStorage: this.deps.permissionsConfigStorage,
        conversationId,
        taskStorage: this.deps.taskStorage,
        tokenRecordStorage: this.deps.tokenRecordStorage,
        skillIds,
      })

      const allTools = agentToolsResult.tools
      const systemPrompt = agentToolsResult.instructions
        ? agent.systemPrompt + '\n\n' + agentToolsResult.instructions
        : agent.systemPrompt

      // 8. Build messages for AI
      const uiMessages: UIMessage[] = [{
        id: userMsgId,
        role: 'user',
        parts: [{ type: 'text', text: userContent }],
      }]
      const modelMessages = await convertToModelMessages(uiMessages)

      const hasTools = Object.keys(allTools).length > 0

      // 9. Call streamText and consume the full stream
      const result = streamText({
        model,
        system: systemPrompt,
        messages: modelMessages,
        tools: hasTools ? allTools : undefined,
        stopWhen: hasTools ? stepCountIs(10) : undefined,
        onAbort: async ({ steps }) => {
          // Sum usage from completed steps (matches chat.ts pattern)
          let abortInput = 0, abortOutput = 0
          for (const step of steps) {
            abortInput += step.usage?.inputTokens ?? 0
            abortOutput += step.usage?.outputTokens ?? 0
          }
          try {
            this.deps.tokenRecordStorage.save(projectId, {
              conversationId,
              agentId: cronJob.agentId,
              provider: agent.modelConfig.provider,
              model: agent.modelConfig.model,
              inputTokens: abortInput,
              outputTokens: abortOutput,
              source: 'cron',
              aborted: true,
            })
            if (this.deps.wsManager) {
              this.deps.wsManager.emit(`project:${projectId}`, { event: 'token:recorded', projectId, agentId: cronJob.agentId, model: agent.modelConfig.model, inputTokens: abortInput, outputTokens: abortOutput })
            }
            log.debug({ cronJobId: cronJob.id, inputTokens: abortInput, outputTokens: abortOutput, completedSteps: steps.length }, 'saved cron abort token record')
          } catch (err) {
            log.error({ err, cronJobId: cronJob.id }, 'failed to save cron abort token record')
          }
        },
      })

      // Consume the stream fully, capturing the response message with all parts (including tool calls)
      const captured: { id: string; parts: unknown[] }[] = []
      const stream = result.toUIMessageStream({
        generateMessageId: () => generateId('msg'),
        onFinish: ({ responseMessage: msg }) => {
          captured.push({ id: msg.id, parts: msg.parts as unknown[] })
        },
      })
      const reader = stream.getReader()
      while (true) {
        const { done } = await reader.read()
        if (done) break
      }

      // 10. Save assistant response with full parts (tool calls, tool results, text)
      const billingUsage = await result.totalUsage
      const lastStepUsage = await result.usage
      const assistantContent = await result.text
      const capturedMsg = captured[0]
      const assistantMsgId = capturedMsg?.id ?? generateId('msg')
      const assistantParts = capturedMsg?.parts ?? [{ type: 'text', text: assistantContent }]
      const inputTokens = billingUsage.inputTokens ?? 0
      const outputTokens = billingUsage.outputTokens ?? 0
      const contextTokens = lastStepUsage.totalTokens ?? 0
      await this.deps.conversationStorage.saveMessage(projectId, conversationId, {
        id: assistantMsgId as any,
        role: 'assistant',
        parts: assistantParts,
        content: assistantContent,
        contextTokens,
        provider: agent.modelConfig.provider,
        model: agent.modelConfig.model,
      })

      // Write token_record for this cron API call
      try {
        this.deps.tokenRecordStorage.save(projectId, {
          conversationId,
          messageId: assistantMsgId,
          agentId: cronJob.agentId,
          provider: agent.modelConfig.provider,
          model: agent.modelConfig.model,
          inputTokens,
          outputTokens,
          source: 'cron',
        })
        if (this.deps.wsManager) {
          this.deps.wsManager.emit(`project:${projectId}`, { event: 'token:recorded', projectId, agentId: cronJob.agentId, model: agent.modelConfig.model, inputTokens, outputTokens })
        }
      } catch (err) {
        log.error({ err, conversationId }, 'failed to save cron token record')
      }

      // 11. Cleanup tools
      await agentToolsResult.cleanup()

      // 12. Update run to success
      const durationMs = Date.now() - startTime
      await this.deps.cronJobRunStorage.updateStatus(projectId, run.id, 'success', { durationMs })

      // 13. Update cronJob metadata
      const nextRun = this.getNextRun(cronJob)
      await this.deps.cronJobStorage.updateRunMeta(projectId, cronJob.id, {
        lastRunAt: new Date().toISOString(),
        lastRunStatus: 'success',
        lastRunId: run.id,
        nextRunAt: nextRun?.toISOString(),
      })

      // --- Agent status lifecycle: mark idle ---
      await this.markAgentIdle(projectId, cronJob)

      log.info({ cronJobId: cronJob.id, durationMs, conversationId }, 'cron job executed successfully')
      return { ...run, status: 'success', durationMs, conversationId }
    } catch (err) {
      const durationMs = Date.now() - startTime
      const errorMessage = err instanceof Error ? err.message : String(err)

      await this.deps.cronJobRunStorage.updateStatus(projectId, run.id, 'error', {
        durationMs,
        error: errorMessage,
      })

      // Update cronJob metadata with error
      const nextRun = this.getNextRun(cronJob)
      await this.deps.cronJobStorage.updateRunMeta(projectId, cronJob.id, {
        lastRunAt: new Date().toISOString(),
        lastRunStatus: 'error',
        lastRunId: run.id,
        nextRunAt: nextRun?.toISOString(),
      })

      // --- Agent status lifecycle: mark idle on error ---
      await this.markAgentIdle(projectId, cronJob)

      log.error({ cronJobId: cronJob.id, err, durationMs }, 'cron job execution failed')
      return { ...run, status: 'error', durationMs, error: errorMessage }
    }
  }

  private async executeClaudeCode(
    cronJob: CronJob,
    agent: Agent,
    settings: GlobalSettings,
    run: CronJobRun,
    startTime: number,
    project: Project | null,
  ): Promise<CronJobRun> {
    const projectId = cronJob.projectId

    // 1. Create conversation
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const conv = await this.deps.conversationStorage.create(
      projectId,
      cronJob.agentId,
      `[Cron] ${cronJob.name} — ${timestamp}`,
      'claude-code',
    )
    const conversationId = conv.id
    await this.deps.cronJobRunStorage.updateStatus(projectId, run.id, 'running', { conversationId })

    // 2. Build user message
    const userContent = cronJob.instruction || `[Scheduled: ${cronJob.name}] Execute your task.`
    const userMsgId = generateId('msg')
    await this.deps.conversationStorage.saveMessage(projectId, conversationId, {
      id: userMsgId,
      role: 'user',
      parts: [{ type: 'text', text: userContent }],
      content: userContent,
    })

    // 3. Resolve MCP configs
    const mcpConfigs = agent.mcpServers?.length > 0
      ? await this.deps.mcpStorage.resolveNames(projectId, agent.mcpServers)
      : []

    const allAgents = agent.subAgents?.length > 0
      ? await this.deps.agentStorage.list(projectId)
      : []

    // 4. Resolve skill IDs: project-level first, fallback to agent-level (migration compat)
    const skillIds = project?.config?.skillIds?.length
      ? project.config.skillIds
      : (agent.skillIds ?? [])

    // 5. Workspace directory — SDK CLI subprocess cwd
    const workspaceDir = getProjectPath(projectId as string) + '/workspace'

    // Sync skills to SDK filesystem for native discovery
    let systemPrompt = agent.systemPrompt
    let skillCleanup: (() => Promise<void>) | undefined
    let hasSkills = false

    if (skillIds.length > 0) {
      try {
        const { cleanup } = await syncSkillsToSdkDir(projectId as string, skillIds as string[], workspaceDir)
        skillCleanup = cleanup
        hasSkills = true
      } catch (err) {
        log.warn({ err, projectId }, 'failed to sync skills to SDK directory for cron')
      }
    }

    // 6. Resolve permission mode from project config
    let permissionMode: string | undefined
    try {
      const platform = process.platform as SupportedPlatform
      const resolved = await resolvePermissionsConfig(
        this.deps.permissionsConfigStorage,
        projectId,
        project?.config?.permissionsConfigId as PermissionsConfigId | undefined,
        workspaceDir,
        platform,
      )
      permissionMode = resolved.mode
    } catch (err) {
      log.warn({ err, projectId }, 'failed to resolve permissions for cron claude-code')
    }

    // 7. Create a no-op writer (cron doesn't stream to clients)
    const noopWriter: UIMessageStreamWriter = {
      write: () => {},
      merge: () => {},
    } as unknown as UIMessageStreamWriter

    // 8. Call SDK handler
    const contentBlocks: SDKContentBlock[] = [{ type: 'text', text: userContent }]

    const sdkResult = await handleClaudeCodeStream(
      {
        agent,
        contentBlocks,
        systemPrompt,
        cwd: workspaceDir,
        permissionMode,
        allAgents,
        mcpConfigs,
        hasSkills,
      },
      noopWriter,
    )

    // Cleanup skill temp directory
    if (skillCleanup) {
      await skillCleanup().catch(() => {})
    }

    // 8. Save assistant message
    const assistantMsgId = generateId('msg')
    const displayText = sdkResult.responseText || '[Claude Code SDK response]'
    await this.deps.conversationStorage.saveMessage(projectId, conversationId, {
      id: assistantMsgId as any,
      role: 'assistant',
      parts: [{ type: 'text', text: displayText }],
      content: displayText,
      inputTokens: sdkResult.inputTokens,
      outputTokens: sdkResult.outputTokens,
      provider: 'anthropic',
      model: agent.modelConfig?.model ?? 'claude-code',
    })

    // 9. Save token record
    try {
      this.deps.tokenRecordStorage.save(projectId, {
        conversationId,
        messageId: assistantMsgId,
        agentId: cronJob.agentId,
        provider: 'anthropic',
        model: agent.modelConfig?.model ?? 'claude-code',
        inputTokens: sdkResult.inputTokens,
        outputTokens: sdkResult.outputTokens,
        source: 'cron',
      })
      if (this.deps.wsManager) {
        this.deps.wsManager.emit(`project:${projectId}`, {
          event: 'token:recorded', projectId,
          agentId: cronJob.agentId,
          model: agent.modelConfig?.model ?? 'claude-code',
          inputTokens: sdkResult.inputTokens,
          outputTokens: sdkResult.outputTokens,
        })
      }
    } catch (err) {
      log.error({ err, conversationId }, 'failed to save cron claude-code token record')
    }

    // 10. Update run to success
    const durationMs = Date.now() - startTime
    await this.deps.cronJobRunStorage.updateStatus(projectId, run.id, 'success', { durationMs })

    // 11. Update cronJob metadata
    const nextRun = this.getNextRun(cronJob)
    await this.deps.cronJobStorage.updateRunMeta(projectId, cronJob.id, {
      lastRunAt: new Date().toISOString(),
      lastRunStatus: 'success',
      lastRunId: run.id,
      nextRunAt: nextRun?.toISOString(),
    })

    // 12. Mark agent idle
    await this.markAgentIdle(projectId, cronJob)

    log.info({ cronJobId: cronJob.id, durationMs, conversationId }, 'cron job (claude-code) executed successfully')
    return { ...run, status: 'success', durationMs, conversationId }
  }

  private async markAgentIdle(projectId: ProjectId, cronJob: CronJob) {
    try {
      // Reference counting: only set idle when no active chats remain for this agent
      const stillActive = this.deps.activeChatRegistry?.countByAgent(cronJob.agentId as string) ?? 0
      const newStatus = stillActive > 0 ? 'running' : 'idle'
      if (stillActive === 0) {
        await this.deps.agentStorage.update(projectId, cronJob.agentId, { status: 'idle' })
      }
      if (this.deps.wsManager) {
        this.deps.wsManager.emit(`project:${projectId}`, { event: 'agent:status_changed', agentId: cronJob.agentId, status: newStatus })
        this.deps.wsManager.emit(`project:${projectId}`, { event: 'runtime:cron_ended', projectId, agentId: cronJob.agentId, cronJobId: cronJob.id })
      }
    } catch (err) {
      log.warn({ err, agentId: cronJob.agentId }, 'failed to set agent idle status after cron')
    }
  }

  private getNextRun(cronJob: CronJob): Date | null {
    if (cronJob.scheduleType === 'once') return null
    try {
      const { Cron } = require('croner')
      const c = new Cron(cronJob.cronExpression)
      const next = c.nextRun()
      c.stop()
      return next
    } catch {
      return null
    }
  }
}
