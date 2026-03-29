import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai'
import type {
  ConversationId, CronJob, CronJobRun, ProjectId, AgentId, TeamId, TeamMember,
  IAgentService, IConversationService, ISettingsService, IMCPService, IPermissionsConfigService, IProjectService, ITeamService,
} from '@golemancy/shared'
import { resolveAgentId } from '@golemancy/shared'
import type { SqliteConversationTaskStorage } from '../storage/tasks'
import type { SqliteMemoryStorage } from '../storage/memories'
import type { SqliteCronJobRunStorage } from '../storage/cron-job-runs'
import type { FileCronJobStorage } from '../storage/cronjobs'
import type { TokenRecordStorage } from '../storage/token-records'
import type { WebSocketManager } from '../ws/handler'
import type { ActiveChatRegistry } from '../agent/active-chat-registry'
import type { OAuthManager } from '../auth/oauth-manager'
import { resolveModel, buildSystemPromptOptions } from '../agent/model'
import { loadAgentTools } from '../agent/tools'
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
  memoryStorage: SqliteMemoryStorage
  projectStorage: IProjectService
  teamStorage: ITeamService
  tokenRecordStorage: TokenRecordStorage
  wsManager?: WebSocketManager
  activeChatRegistry?: ActiveChatRegistry
  oauthManager?: OAuthManager
}

export class CronJobExecutor {
  private runningControllers = new Map<string, AbortController>()

  constructor(private deps: ExecutorDeps) {}

  async execute(cronJob: CronJob, triggeredBy: 'schedule' | 'manual'): Promise<CronJobRun> {
    const abortController = new AbortController()
    const controllerKey = `${cronJob.projectId}:${cronJob.id}:${Date.now()}`
    this.runningControllers.set(controllerKey, abortController)

    const startTime = Date.now()
    const projectId = cronJob.projectId

    // Resolve team + agentId from target
    let team: Awaited<ReturnType<ITeamService['getById']>> | undefined
    let teamMembers: TeamMember[] | undefined
    let teamInstruction: string | undefined
    if (cronJob.targetType === 'team') {
      team = (await this.deps.teamStorage.getById(projectId, cronJob.targetId as TeamId)) ?? undefined
      if (team) {
        teamMembers = team.members
        teamInstruction = team.instruction
      }
    }
    let agentId: AgentId
    try {
      agentId = resolveAgentId(cronJob.targetType, cronJob.targetId, team ?? undefined)
    } catch (err) {
      log.error({ err, cronJobId: cronJob.id, targetType: cronJob.targetType, targetId: cronJob.targetId }, 'failed to resolve agent for cron job')
      throw new Error(`Cannot resolve agent for cron job ${cronJob.id}: ${err instanceof Error ? err.message : String(err)}`)
    }

    // 1. Create CronJobRun record
    const run = await this.deps.cronJobRunStorage.create(projectId, {
      cronJobId: cronJob.id,
      projectId,
      agentId,
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
      await this.deps.agentStorage.update(projectId, agentId, { status: 'running' })
      if (this.deps.wsManager) {
        this.deps.wsManager.emit(`project:${projectId}`, { event: 'agent:status_changed', agentId, status: 'running' })
        this.deps.wsManager.emit(`project:${projectId}`, { event: 'runtime:cron_started', projectId, agentId, cronJobId: cronJob.id })
      }
    } catch (err) {
      log.warn({ err, agentId }, 'failed to set agent running status for cron')
    }

    let registeredConversationId: string | undefined
    try {
      // 2. Load agent config
      const agent = await this.deps.agentStorage.getById(projectId, agentId)
      if (!agent) throw new Error(`Agent ${agentId} not found`)

      // 3. Load global settings
      const settings = await this.deps.settingsStorage.get()

      // 4. Resolve model
      const resolved = await resolveModel(settings, agent.modelConfig, this.deps.oauthManager)

      // 5. Create conversation
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const conv = await this.deps.conversationStorage.create(
        projectId,
        cronJob.targetType,
        cronJob.targetId,
        `[Cron] ${cronJob.name} — ${timestamp}`,
      )
      const conversationId = conv.id
      registeredConversationId = conversationId
      this.deps.activeChatRegistry?.register(conversationId, { agentId: agentId as string, projectId: projectId as string, abortController })

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
      const project = await this.deps.projectStorage.getById(projectId)
      const allAgents = (teamMembers && teamMembers.length > 0)
        ? await this.deps.agentStorage.list(projectId)
        : []

      const agentToolsResult = await loadAgentTools({
        agent,
        projectId,
        settings,
        allAgents,
        mcpStorage: this.deps.mcpStorage,
        permissionsConfigId: project?.config.permissionsConfigId,
        permissionsConfigStorage: this.deps.permissionsConfigStorage,
        conversationId,
        conversationStorage: this.deps.conversationStorage,
        taskStorage: this.deps.taskStorage,
        memoryStorage: this.deps.memoryStorage,
        tokenRecordStorage: this.deps.tokenRecordStorage,
        teamMembers,
        teamInstruction,
        oauthManager: this.deps.oauthManager,
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
        model: resolved.model,
        ...buildSystemPromptOptions(resolved, systemPrompt),
        messages: modelMessages,
        tools: hasTools ? allTools : undefined,
        stopWhen: hasTools ? stepCountIs(10) : undefined,
        abortSignal: abortController.signal,
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
              agentId: agentId,
              provider: agent.modelConfig.provider,
              model: agent.modelConfig.model,
              inputTokens: abortInput,
              outputTokens: abortOutput,
              source: 'cron',
              aborted: true,
            })
            if (this.deps.wsManager) {
              this.deps.wsManager.emit(`project:${projectId}`, { event: 'token:recorded', projectId, agentId: agentId, model: agent.modelConfig.model, inputTokens: abortInput, outputTokens: abortOutput })
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
          agentId: agentId,
          provider: agent.modelConfig.provider,
          model: agent.modelConfig.model,
          inputTokens,
          outputTokens,
          source: 'cron',
        })
        if (this.deps.wsManager) {
          this.deps.wsManager.emit(`project:${projectId}`, { event: 'token:recorded', projectId, agentId: agentId, model: agent.modelConfig.model, inputTokens, outputTokens })
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

      // --- Active chat lifecycle: unregister before idle check ---
      if (registeredConversationId) this.deps.activeChatRegistry?.unregister(registeredConversationId)

      // --- Agent status lifecycle: mark idle ---
      await this.markAgentIdle(projectId, agentId, cronJob.id, conversationId)

      this.runningControllers.delete(controllerKey)
      log.info({ cronJobId: cronJob.id, durationMs, conversationId }, 'cron job executed successfully')
      return { ...run, status: 'success', durationMs, conversationId }
    } catch (err) {
      this.runningControllers.delete(controllerKey)
      // Cleanup tools (browser processes, MCP connections, etc.) to prevent resource leaks
      try { await agentToolsResult?.cleanup() } catch {}
      // --- Active chat lifecycle: unregister immediately to avoid leaking on subsequent errors ---
      if (registeredConversationId) this.deps.activeChatRegistry?.unregister(registeredConversationId)

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
      await this.markAgentIdle(projectId, agentId, cronJob.id)

      log.error({ cronJobId: cronJob.id, err, durationMs }, 'cron job execution failed')
      return { ...run, status: 'error', durationMs, error: errorMessage }
    }
  }

  /** Abort all running cron executions for a project. */
  abortProject(projectId: string): void {
    for (const [key, controller] of this.runningControllers) {
      if (key.startsWith(`${projectId}:`)) {
        controller.abort()
        this.runningControllers.delete(key)
      }
    }
  }

  private async markAgentIdle(projectId: ProjectId, agentId: AgentId, cronJobId: CronJob['id'], conversationId?: ConversationId) {
    try {
      // Reference counting: only set idle when no active chats remain for this agent
      const stillActive = this.deps.activeChatRegistry?.countByAgent(agentId as string) ?? 0
      const newStatus = stillActive > 0 ? 'running' : 'idle'
      if (stillActive === 0) {
        await this.deps.agentStorage.update(projectId, agentId, { status: 'idle' })
      }
      if (this.deps.wsManager) {
        this.deps.wsManager.emit(`project:${projectId}`, { event: 'agent:status_changed', agentId, status: newStatus })
        this.deps.wsManager.emit(`project:${projectId}`, { event: 'runtime:cron_ended', projectId, agentId, cronJobId, conversationId })
      }
    } catch (err) {
      log.warn({ err, agentId }, 'failed to set agent idle status after cron')
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
