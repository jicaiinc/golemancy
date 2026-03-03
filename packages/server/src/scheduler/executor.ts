import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai'
import type {
  CronJob, CronJobRun, ProjectId,
  IAgentService, IConversationService, ISettingsService, IMCPService, IPermissionsConfigService, IProjectService,
} from '@golemancy/shared'
import type { SqliteConversationTaskStorage } from '../storage/tasks'
import type { SqliteCronJobRunStorage } from '../storage/cron-job-runs'
import type { FileCronJobStorage } from '../storage/cronjobs'
import type { TokenRecordStorage } from '../storage/token-records'
import type { KnowledgeBaseStorage } from '../storage/knowledge-base'
import type { WebSocketManager } from '../ws/handler'
import type { ActiveChatRegistry } from '../agent/active-chat-registry'
import { resolveModel } from '../agent/model'
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
  projectStorage: IProjectService
  tokenRecordStorage: TokenRecordStorage
  kbStorage?: KnowledgeBaseStorage
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

      // 4. Resolve model
      const model = await resolveModel(settings, agent.modelConfig)

      // 5. Create conversation
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const conv = await this.deps.conversationStorage.create(
        projectId,
        cronJob.agentId,
        `[Cron] ${cronJob.name} — ${timestamp}`,
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
      const project = await this.deps.projectStorage.getById(projectId)
      const allAgents = agent.subAgents?.length > 0
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
        tokenRecordStorage: this.deps.tokenRecordStorage,
        kbStorage: this.deps.kbStorage,
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
