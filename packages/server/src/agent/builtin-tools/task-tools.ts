import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { ProjectId, ConversationId, TaskId } from '@golemancy/shared'
import type { SqliteConversationTaskStorage } from '../../storage/tasks'
import { logger } from '../../logger'

const log = logger.child({ component: 'agent:task-tools' })

export interface TaskToolsContext {
  projectId: ProjectId
  conversationId: ConversationId
  taskStorage: SqliteConversationTaskStorage
}

/**
 * Build the task instructions block for injection into the agent's system prompt.
 */
export function buildTaskInstructions(): string {
  const lines: string[] = []
  lines.push('# Task Management')
  lines.push('')
  lines.push('You have 4 task tools: TaskCreate, TaskGet, TaskList, TaskUpdate.')
  lines.push('Tasks are scoped to the current conversation — they are not visible in other conversations.')
  lines.push('')
  lines.push('## When to use tasks')
  lines.push('Use tasks proactively in these scenarios:')
  lines.push('- Complex multi-step tasks that require 3 or more distinct steps')
  lines.push('- The user explicitly requests a task or todo list')
  lines.push('- The user provides multiple tasks (numbered or comma-separated)')
  lines.push('- Plan mode — create a task list to track the work')
  lines.push('')
  lines.push('## When NOT to use tasks')
  lines.push('- There is only a single, straightforward action — just do it directly')
  lines.push('- The task is trivial and can be completed in fewer than 3 steps')
  lines.push('- The task is purely conversational or informational')
  lines.push('- You can finish the entire request with one or two tool calls')
  lines.push('')
  lines.push('NOTE: Do NOT create a task for every request. If there is only one simple thing to do, doing it directly is faster and better than creating a task to track it.')
  lines.push('')
  lines.push('## Status workflow')
  lines.push('`pending` → `in_progress` → `completed`. Set status to `deleted` to discard a task.')
  lines.push('- If you will start a task immediately after creating it, set `status: "in_progress"` on TaskCreate directly — do NOT create as `pending` then immediately update to `in_progress`')
  lines.push('- Mark it `completed` only after you have fully finished the work')
  lines.push('- ONLY mark a task as completed when you have FULLY accomplished it — if you encounter errors, blockers, or cannot finish, keep the task as `in_progress`')
  lines.push('- After completing a task, call TaskList to find the next available task')
  lines.push('')
  lines.push('## Dependencies')
  lines.push('- Use `addBlockedBy` to declare that a task cannot start until its dependencies are done')
  lines.push('- Use `addBlocks` to declare that other tasks depend on this one')
  lines.push('- TaskList automatically filters out completed/deleted tasks from `blockedBy`')
  lines.push('')
  lines.push('## Tips')
  lines.push('- `activeForm` is shown in the UI spinner while a task is in progress (e.g., "Running tests")')
  lines.push('- Keep `subject` concise and in imperative form (e.g., "Fix login bug")')
  lines.push('- Use `description` for detailed requirements and acceptance criteria')
  lines.push('- Check TaskList first to avoid creating duplicate tasks')
  lines.push('- Create all planned tasks upfront, then use TaskUpdate to set up dependencies if needed')
  return lines.join('\n')
}

export function createTaskTools(ctx: TaskToolsContext): ToolSet {
  const { projectId, conversationId, taskStorage } = ctx

  return {
    TaskCreate: tool({
      description: 'Create a task for multi-step work (3+ steps). For single actions, skip and do directly. Set status to "in_progress" if starting immediately.',
      inputSchema: z.object({
        subject: z.string().describe('Brief title for the task'),
        description: z.string().optional().describe('Detailed description of what needs to be done'),
        activeForm: z.string().optional().describe('Present continuous form shown while task is in progress (e.g., "Running tests")'),
        status: z.enum(['pending', 'in_progress']).optional().describe('Initial status. Use "in_progress" if you will start this task immediately. Default: "pending".'),
      }),
      execute: async ({ subject, description, activeForm, status }) => {
        log.debug({ projectId, conversationId, subject }, 'TaskCreate tool called')
        const task = await taskStorage.create(projectId, conversationId, { subject, description, activeForm, status })
        return task
      },
    }),

    TaskGet: tool({
      description: 'Get full details of a task by its ID',
      inputSchema: z.object({
        taskId: z.string().describe('The ID of the task to retrieve'),
      }),
      execute: async ({ taskId }) => {
        log.debug({ projectId, taskId }, 'TaskGet tool called')
        const task = await taskStorage.getById(projectId, taskId as TaskId)
        if (!task) return { error: `Task ${taskId} not found` }
        return task
      },
    }),

    TaskList: tool({
      description: 'List all tasks in the current conversation',
      inputSchema: z.object({}),
      execute: async () => {
        log.debug({ projectId, conversationId }, 'TaskList tool called')
        const tasks = await taskStorage.list(projectId, conversationId)
        return tasks
          .filter(t => t.status !== 'deleted')
          .map(t => ({
            id: t.id,
            subject: t.subject,
            status: t.status,
            owner: t.owner,
            blockedBy: t.blockedBy.filter(bid =>
              tasks.some(bt => bt.id === bid && bt.status !== 'completed' && bt.status !== 'deleted')
            ),
          }))
      },
    }),

    TaskUpdate: tool({
      description: 'Update a task status, details, or dependencies. Mark completed only when fully done; if blocked, keep as in_progress.',
      inputSchema: z.object({
        taskId: z.string().describe('The ID of the task to update'),
        status: z.enum(['pending', 'in_progress', 'completed', 'deleted']).optional(),
        subject: z.string().optional(),
        description: z.string().optional(),
        activeForm: z.string().optional(),
        owner: z.string().optional(),
        metadata: z.record(z.unknown()).optional(),
        addBlocks: z.array(z.string()).optional().describe('Task IDs that this task blocks'),
        addBlockedBy: z.array(z.string()).optional().describe('Task IDs that block this task'),
      }),
      execute: async ({ taskId, ...data }) => {
        log.debug({ projectId, taskId, fields: Object.keys(data) }, 'TaskUpdate tool called')
        try {
          const updated = await taskStorage.update(projectId, taskId as TaskId, {
            ...data,
            addBlocks: data.addBlocks as TaskId[] | undefined,
            addBlockedBy: data.addBlockedBy as TaskId[] | undefined,
          })
          return updated
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) }
        }
      },
    }),
  }
}
