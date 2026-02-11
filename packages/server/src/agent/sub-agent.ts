import { tool, generateText, stepCountIs, type ToolSet } from 'ai'
import { z } from 'zod'
import type { Agent, GlobalSettings } from '@solocraft/shared'
import { resolveModel } from './model'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:sub-agent' })

export function createSubAgentTool(
  childAgent: Agent,
  settings: GlobalSettings,
  childTools?: ToolSet,
) {
  return tool({
    description: `Delegate task to ${childAgent.name}: ${childAgent.description}`,
    inputSchema: z.object({
      task: z.string().describe('The task to delegate'),
      context: z.string().optional().describe('Additional context'),
    }),
    execute: async ({ task, context }, { abortSignal }) => {
      log.debug({ childAgentId: childAgent.id, childAgentName: childAgent.name }, 'delegating to sub-agent')
      const childModel = await resolveModel(settings, childAgent.modelConfig)

      const result = await generateText({
        model: childModel,
        system: childAgent.systemPrompt,
        prompt: context ? `${task}\n\nContext: ${context}` : task,
        tools: childTools,
        stopWhen: stepCountIs(10),
        abortSignal,
      })

      return result.text
    },
  })
}
