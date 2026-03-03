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
  lines.push('## Task Management')
  lines.push('')
  lines.push('You have 4 task tools: TaskCreate, TaskGet, TaskList, TaskUpdate.')
  lines.push('Tasks are scoped to the current conversation — they are not visible in other conversations.')
  lines.push('')
  lines.push('### When to use tasks')
  lines.push('- Use tasks for multi-step work that benefits from progress tracking')
  lines.push('- Skip tasks for simple, single-step requests — just do the work directly')
  lines.push('')
  lines.push('### Status workflow')
  lines.push('`pending` → `in_progress` → `completed`. Set status to `deleted` to discard a task.')
  lines.push('- Mark a task `in_progress` before you start working on it')
  lines.push('- Mark it `completed` only after you have fully finished the work')
  lines.push('- After completing a task, call TaskList to find the next available task')
  lines.push('')
  lines.push('### Dependencies')
  lines.push('- Use `addBlockedBy` to declare that a task cannot start until its dependencies are done')
  lines.push('- Use `addBlocks` to declare that other tasks depend on this one')
  lines.push('- TaskList automatically filters out completed/deleted tasks from `blockedBy`')
  lines.push('')
  lines.push('### Tips')
  lines.push('- `activeForm` is shown in the UI spinner while a task is in progress (e.g., "Running tests")')
  lines.push('- Keep `subject` concise and in imperative form (e.g., "Fix login bug")')
  lines.push('- Use `description` for detailed requirements and acceptance criteria')
  return lines.join('\n')
}

export function createTaskTools(ctx: TaskToolsContext): ToolSet {
  const { projectId, conversationId, taskStorage } = ctx

  return {
    TaskCreate: tool({
      description: 'Create a new task to track work within this conversation',
      inputSchema: z.object({
        subject: z.string().describe('Brief title for the task'),
        description: z.string().optional().describe('Detailed description of what needs to be done'),
        activeForm: z.string().optional().describe('Present continuous form shown while task is in progress (e.g., "Running tests")'),
      }),
      execute: async ({ subject, description, activeForm }) => {
        log.debug({ projectId, conversationId, subject }, 'TaskCreate tool called')
        const task = await taskStorage.create(projectId, conversationId, { subject, description, activeForm })
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
      description: 'Update a task (status, subject, description, owner, metadata, dependencies)',
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
