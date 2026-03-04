import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores'
import type { SubAgentStreamState, SubAgentToolCallState } from '@golemancy/shared'

interface ToolInvocationBase {
  toolName: string
  toolCallId: string
  state: string
  input?: unknown
  output?: unknown
  errorText?: string
}

interface StepUsage {
  inputTokens: number
  outputTokens: number
}

interface ToolCallDisplayProps {
  toolInvocation: ToolInvocationBase
  chatStatus?: string
  usage?: StepUsage
}

const DELEGATE_PREFIX = 'delegate_to_'

type TFn = (key: string, options?: Record<string, unknown>) => string

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function UsageBadge({ usage }: { usage: StepUsage }) {
  if (usage.inputTokens === 0 && usage.outputTokens === 0) return null
  return (
    <span className="text-[10px] font-mono text-text-dim">
      {formatTokens(usage.inputTokens)}↑ {formatTokens(usage.outputTokens)}↓
    </span>
  )
}

/**
 * Resolve a delegate_to_<agentId> tool name to a human-readable display name.
 * Falls back to the raw tool name if the agent is not found.
 */
function useToolDisplayName(toolName: string): string {
  const agents = useAppStore(s => s.agents)

  if (!toolName.startsWith(DELEGATE_PREFIX)) return toolName

  const agentId = toolName.slice(DELEGATE_PREFIX.length)
  const agent = agents.find(a => a.id === agentId)
  return agent ? agent.name : toolName
}

function getStatusLabel(state: string, t: TFn): { text: string; color: string } {
  switch (state) {
    case 'input-streaming':
    case 'input-available':
      return { text: t('tool.running'), color: 'text-accent-amber' }
    case 'approval-requested':
      return { text: t('tool.awaitingApproval'), color: 'text-accent-amber' }
    case 'approval-responded':
      return { text: t('tool.approved'), color: 'text-accent-blue' }
    case 'output-available':
      return { text: t('tool.done'), color: 'text-accent-green' }
    case 'output-error':
      return { text: t('common:status.error'), color: 'text-accent-red' }
    case 'output-denied':
      return { text: t('tool.denied'), color: 'text-accent-red' }
    default:
      return { text: state, color: 'text-text-dim' }
  }
}

/** Returns true when chat has finished but a snapshot still shows a running state */
function isChatDone(chatStatus: string | undefined): boolean {
  return chatStatus === 'ready' || chatStatus === 'error'
}

function isSubAgentStreamState(output: unknown): output is SubAgentStreamState {
  return (
    typeof output === 'object' &&
    output !== null &&
    'agentName' in output &&
    'toolCalls' in output &&
    'status' in output
  )
}

// --- SubAgentDisplay (recursive) ---

interface SubAgentDisplayProps {
  state: SubAgentStreamState
  chatStatus?: string
  task?: string
  usage?: StepUsage
}

function SubAgentToolItem({ tc, chatStatus }: { tc: SubAgentToolCallState; chatStatus?: string }) {
  const { t } = useTranslation(['chat', 'common'])
  const [expanded, setExpanded] = useState(false)
  const isRunning = tc.state === 'running' && !isChatDone(chatStatus)

  // Nested sub-agent: recurse
  if (tc.name.startsWith(DELEGATE_PREFIX) && isSubAgentStreamState(tc.output)) {
    return <SubAgentDisplay state={tc.output} chatStatus={chatStatus} task={typeof tc.input === 'object' && tc.input !== null && 'task' in tc.input ? String((tc.input as { task: string }).task) : undefined} />
  }

  return (
    <div className="border-2 border-border-dim bg-deep">
      <button
        className="w-full flex items-center gap-2 px-2 py-1 text-left cursor-pointer hover:bg-elevated/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[10px] text-text-dim font-mono select-none">
          {expanded ? '[-]' : '[+]'}
        </span>
        <span className="font-mono text-[11px] text-accent-amber truncate">
          {tc.name}
        </span>
        {isRunning && (
          <span className="inline-block w-[5px] h-[5px] bg-accent-amber animate-[pixel-blink_1s_steps(2)_infinite]" />
        )}
        <span className={`ml-auto text-[10px] font-mono ${isRunning ? 'text-accent-amber' : tc.state === 'error' ? 'text-accent-red' : 'text-accent-green'}`}>
          {isRunning ? t('tool.running') : tc.state === 'error' ? t('common:status.error') : t('tool.done')}
        </span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-2 border-t-2 border-border-dim">
              {tc.input !== undefined && (
                <div className="mt-1">
                  <span className="text-[9px] font-pixel text-text-dim">{t('tool.input')}</span>
                  <pre className="mt-0.5 text-[10px] font-mono text-text-secondary bg-void p-1.5 overflow-x-auto">
                    {typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input, null, 2)}
                  </pre>
                </div>
              )}
              {tc.output !== undefined && (
                <div className="mt-1">
                  <span className="text-[9px] font-pixel text-text-dim">{t('tool.output')}</span>
                  <pre className="mt-0.5 text-[10px] font-mono text-text-secondary bg-void p-1.5 overflow-x-auto">
                    {typeof tc.output === 'string' ? tc.output : JSON.stringify(tc.output, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function SubAgentDisplay({ state, chatStatus, task, usage }: SubAgentDisplayProps) {
  const { t } = useTranslation('chat')
  const isRunning = state.status === 'running' && !isChatDone(chatStatus)
  const [expanded, setExpanded] = useState(isRunning)

  // Auto-expand when running, auto-collapse when done
  useEffect(() => {
    setExpanded(isRunning)
  }, [isRunning])

  const toolCount = state.toolCalls.length
  const runningTools = isRunning ? state.toolCalls.filter(tc => tc.state === 'running').length : 0

  return (
    <div className="my-2 border-2 border-border-dim bg-deep">
      {/* Header */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer hover:bg-elevated/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[10px] text-text-dim font-mono select-none">
          {expanded ? '[-]' : '[+]'}
        </span>
        <span className="font-mono text-[12px] text-accent-cyan">
          {state.agentName}
        </span>
        {state.sessionId && (
          <span className="text-[9px] font-mono text-text-dim">{state.sessionId}</span>
        )}
        {isRunning && (
          <span className="inline-block w-[6px] h-[6px] bg-accent-cyan animate-[pixel-blink_1s_steps(2)_infinite]" />
        )}
        {toolCount > 0 && (
          <span className="text-[10px] font-mono text-text-dim">
            {runningTools > 0
              ? t('tool.toolCountRunning', { running: runningTools, total: toolCount })
              : t('tool.toolCountDone', { total: toolCount })}
          </span>
        )}
        {usage && <UsageBadge usage={usage} />}
        <span className={`ml-auto text-[11px] font-mono ${isRunning ? 'text-accent-cyan' : 'text-accent-green'}`}>
          {isRunning ? t('tool.running') : t('tool.done')}
        </span>
      </button>

      {/* Expandable content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 border-t-2 border-border-dim space-y-2">
              {/* Task */}
              {task && (
                <div className="mt-2">
                  <span className="text-[10px] font-pixel text-text-dim">{t('tool.task')}</span>
                  <pre className="mt-1 text-[11px] font-mono text-text-secondary bg-void p-2 overflow-x-auto whitespace-pre-wrap">
                    {task}
                  </pre>
                </div>
              )}

              {/* Session ID — selectable for copy */}
              {state.sessionId && (
                <div className="mt-2">
                  <span className="text-[10px] font-pixel text-text-dim">{t('tool.session')}</span>
                  <pre className="mt-0.5 text-[10px] font-mono text-text-secondary bg-void p-1.5 select-text">{state.sessionId}</pre>
                </div>
              )}

              {/* Tool calls */}
              {state.toolCalls.length > 0 && (
                <div className="mt-2 space-y-1">
                  <span className="text-[10px] font-pixel text-text-dim">{t('tool.tools')}</span>
                  {state.toolCalls.map(tc => (
                    <SubAgentToolItem key={tc.id} tc={tc} chatStatus={chatStatus} />
                  ))}
                </div>
              )}

              {/* Output text */}
              {state.text && (
                <div className="mt-2">
                  <span className="text-[10px] font-pixel text-text-dim">{t('tool.output')}</span>
                  <pre className="mt-1 text-[11px] font-mono text-text-secondary bg-void p-2 overflow-x-auto whitespace-pre-wrap">
                    {state.text}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// --- Task Tool Display ---

const TASK_TOOL_NAMES = new Set(['TaskCreate', 'TaskGet', 'TaskList', 'TaskUpdate'])

function TaskToolCallDisplay({ toolInvocation, chatStatus, usage }: ToolCallDisplayProps) {
  const { t } = useTranslation('chat')
  const [expanded, setExpanded] = useState(false)
  const chatDone = isChatDone(chatStatus)
  const rawIsRunning = toolInvocation.state === 'input-streaming' || toolInvocation.state === 'input-available'
  const isRunning = rawIsRunning && !chatDone
  const effectiveState = rawIsRunning && chatDone ? 'output-available' : toolInvocation.state
  const status = getStatusLabel(effectiveState, t)
  const hasOutput = toolInvocation.state === 'output-available' || (rawIsRunning && chatDone)
  const output = hasOutput ? toolInvocation.output : null

  const toolLabel: Record<string, string> = {
    TaskCreate: t('tool.taskCreate'),
    TaskGet: t('tool.taskGet'),
    TaskList: t('tool.taskList'),
    TaskUpdate: t('tool.taskUpdate'),
  }

  // Parse output for display
  const taskData = output && typeof output === 'object' && !Array.isArray(output) ? output as Record<string, unknown> : null
  const taskList = output && Array.isArray(output) ? output as Array<Record<string, unknown>> : null

  return (
    <div className="my-2 border-2 border-border-dim bg-deep">
      {/* Header — always visible */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer hover:bg-elevated/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[10px] text-text-dim font-mono select-none">
          {expanded ? '[-]' : '[+]'}
        </span>
        <span className="font-mono text-[12px] text-accent-cyan">
          {toolLabel[toolInvocation.toolName] ?? toolInvocation.toolName}
        </span>
        {isRunning && (
          <span className="inline-block w-[6px] h-[6px] bg-accent-cyan animate-[pixel-blink_1s_steps(2)_infinite]" />
        )}
        {usage && <UsageBadge usage={usage} />}
        <span className={`ml-auto text-[11px] font-mono ${status.color}`}>
          {status.text}
        </span>
      </button>

      {/* Expandable detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="border-t-2 border-border-dim">
              {/* Task card output */}
              {taskData && 'subject' in taskData && (
                <div className="px-3 pb-2">
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[13px] font-mono text-text-primary">{String(taskData.subject)}</span>
                    {typeof taskData.status === 'string' && (
                      <span className={`text-[10px] font-pixel px-1.5 py-0.5 border border-border-dim ${
                        taskData.status === 'completed' ? 'text-accent-green' :
                        taskData.status === 'in_progress' ? 'text-accent-amber' :
                        'text-text-dim'
                      }`}>
                        {taskData.status.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                  {typeof taskData.description === 'string' && (
                    <p className="text-[11px] text-text-dim font-mono mt-1">{taskData.description}</p>
                  )}
                </div>
              )}

              {/* Task list output */}
              {taskList && (
                <div className="px-3 pb-2">
                  <div className="mt-2 space-y-1">
                    {taskList.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px] font-mono">
                        <span>
                          {item.status === 'completed' ? '\u2611' : item.status === 'in_progress' ? '\u25B6' : '\u2610'}
                        </span>
                        <span className="text-text-primary flex-1 truncate">{String(item.subject ?? item.id)}</span>
                        <span className="text-text-dim">{String(item.status ?? '')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error output */}
              {taskData && 'error' in taskData && (
                <div className="px-3 pb-2">
                  <p className="text-[11px] text-accent-red font-mono mt-2">{String(taskData.error)}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// --- Main ToolCallDisplay ---

export function ToolCallDisplay({ toolInvocation, chatStatus, usage }: ToolCallDisplayProps) {
  const { t } = useTranslation(['chat', 'common'])
  const [expanded, setExpanded] = useState(false)
  const displayName = useToolDisplayName(toolInvocation.toolName)

  const chatDone = isChatDone(chatStatus)
  const rawIsRunning = toolInvocation.state === 'input-streaming' || toolInvocation.state === 'input-available'
  const isRunning = rawIsRunning && !chatDone
  const effectiveState = rawIsRunning && chatDone ? 'output-available' : toolInvocation.state
  const status = getStatusLabel(effectiveState, t)
  const hasOutput = toolInvocation.state === 'output-available' || (rawIsRunning && chatDone)
  const hasError = toolInvocation.state === 'output-error'

  // Task tools — render specialized display
  if (TASK_TOOL_NAMES.has(toolInvocation.toolName)) {
    return <TaskToolCallDisplay toolInvocation={toolInvocation} chatStatus={chatStatus} usage={usage} />
  }

  // Check if this is a sub-agent with structured streaming output
  const isSubAgent = toolInvocation.toolName.startsWith(DELEGATE_PREFIX)
  const subAgentState = isSubAgent && isSubAgentStreamState(toolInvocation.output)
    ? toolInvocation.output
    : null

  if (subAgentState) {
    const taskInput = typeof toolInvocation.input === 'object' && toolInvocation.input !== null && 'task' in toolInvocation.input
      ? String((toolInvocation.input as { task: string }).task)
      : undefined
    return <SubAgentDisplay state={subAgentState} chatStatus={chatStatus} task={taskInput} usage={usage} />
  }

  return (
    <div className="my-2 border-2 border-border-dim bg-deep">
      {/* Header — always visible */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer hover:bg-elevated/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[10px] text-text-dim font-mono select-none">
          {expanded ? '[-]' : '[+]'}
        </span>
        <span className="font-mono text-[12px] text-accent-amber">
          {displayName}
        </span>
        {isRunning && (
          <span className="inline-block w-[6px] h-[6px] bg-accent-amber animate-[pixel-blink_1s_steps(2)_infinite]" />
        )}
        {usage && <UsageBadge usage={usage} />}
        <span className={`ml-auto text-[11px] font-mono ${status.color}`}>
          {status.text}
        </span>
      </button>

      {/* Expandable detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 border-t-2 border-border-dim">
              {/* Input */}
              {toolInvocation.input !== undefined && (
                <div className="mt-2">
                  <span className="text-[10px] font-pixel text-text-dim">{t('tool.input')}</span>
                  <pre className="mt-1 text-[11px] font-mono text-text-secondary bg-void p-2 overflow-x-auto">
                    {JSON.stringify(toolInvocation.input, null, 2)}
                  </pre>
                </div>
              )}
              {/* Output */}
              {hasOutput && toolInvocation.output !== undefined && (
                <div className="mt-2">
                  <span className="text-[10px] font-pixel text-text-dim">{t('tool.output')}</span>
                  <pre className="mt-1 text-[11px] font-mono text-text-secondary bg-void p-2 overflow-x-auto">
                    {typeof toolInvocation.output === 'string'
                      ? toolInvocation.output
                      : JSON.stringify(toolInvocation.output, null, 2)}
                  </pre>
                </div>
              )}
              {/* Error */}
              {hasError && toolInvocation.errorText && (
                <div className="mt-2">
                  <span className="text-[10px] font-pixel text-accent-red">{t('tool.error')}</span>
                  <pre className="mt-1 text-[11px] font-mono text-accent-red bg-void p-2 overflow-x-auto">
                    {toolInvocation.errorText}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
