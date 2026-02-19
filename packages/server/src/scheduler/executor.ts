import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai'
import type {
  CronJob, CronJobRun, ProjectId,
  IAgentService, IConversationService, ISettingsService, IMCPService, IPermissionsConfigService, IProjectService,
} from '@golemancy/shared'
import type { SqliteConversationTaskStorage } from '../storage/tasks'
import type { SqliteCronJobRunStorage } from '../storage/cron-job-runs'
import type { FileCronJobStorage } from '../storage/cronjobs'
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
        taskStorage: this.deps.taskStorage,
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
        temperature: agent.modelConfig.temperature,
        maxOutputTokens: agent.modelConfig.maxTokens,
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
      const usage = await result.totalUsage
      const assistantContent = await result.text
      const capturedMsg = captured[0]
      const assistantMsgId = capturedMsg?.id ?? generateId('msg')
      const assistantParts = capturedMsg?.parts ?? [{ type: 'text', text: assistantContent }]
      await this.deps.conversationStorage.saveMessage(projectId, conversationId, {
        id: assistantMsgId as any,
        role: 'assistant',
        parts: assistantParts,
        content: assistantContent,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
      })

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

      log.error({ cronJobId: cronJob.id, err, durationMs }, 'cron job execution failed')
      return { ...run, status: 'error', durationMs, error: errorMessage }
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
