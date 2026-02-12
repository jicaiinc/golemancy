import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useAppStore } from '../../stores'
import type { SubAgentStreamState, SubAgentToolCallState } from '@solocraft/shared'

interface ToolInvocationBase {
  toolName: string
  toolCallId: string
  state: string
  input?: unknown
  output?: unknown
  errorText?: string
}

interface ToolCallDisplayProps {
  toolInvocation: ToolInvocationBase
}

const DELEGATE_PREFIX = 'delegate_to_'

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

function getStatusLabel(state: string): { text: string; color: string } {
  switch (state) {
    case 'input-streaming':
    case 'input-available':
      return { text: 'Running...', color: 'text-accent-amber' }
    case 'approval-requested':
      return { text: 'Awaiting approval', color: 'text-accent-amber' }
    case 'approval-responded':
      return { text: 'Approved', color: 'text-accent-blue' }
    case 'output-available':
      return { text: 'Done', color: 'text-accent-green' }
    case 'output-error':
      return { text: 'Error', color: 'text-accent-red' }
    case 'output-denied':
      return { text: 'Denied', color: 'text-accent-red' }
    default:
      return { text: state, color: 'text-text-dim' }
  }
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
  task?: string
}

function SubAgentToolItem({ tc }: { tc: SubAgentToolCallState }) {
  const [expanded, setExpanded] = useState(false)
  const isRunning = tc.state === 'running'

  // Nested sub-agent: recurse
  if (tc.name.startsWith(DELEGATE_PREFIX) && isSubAgentStreamState(tc.output)) {
    return <SubAgentDisplay state={tc.output} task={typeof tc.input === 'object' && tc.input !== null && 'task' in tc.input ? String((tc.input as { task: string }).task) : undefined} />
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
          {isRunning ? 'Running...' : tc.state === 'error' ? 'Error' : 'Done'}
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
                  <span className="text-[9px] font-pixel text-text-dim">INPUT</span>
                  <pre className="mt-0.5 text-[10px] font-mono text-text-secondary bg-void p-1.5 overflow-x-auto">
                    {typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input, null, 2)}
                  </pre>
                </div>
              )}
              {tc.output !== undefined && (
                <div className="mt-1">
                  <span className="text-[9px] font-pixel text-text-dim">OUTPUT</span>
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

function SubAgentDisplay({ state, task }: SubAgentDisplayProps) {
  const isRunning = state.status === 'running'
  const [expanded, setExpanded] = useState(isRunning)

  // Auto-expand when running, auto-collapse when done
  useEffect(() => {
    setExpanded(isRunning)
  }, [isRunning])

  const toolCount = state.toolCalls.length
  const runningTools = state.toolCalls.filter(tc => tc.state === 'running').length

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
        {isRunning && (
          <span className="inline-block w-[6px] h-[6px] bg-accent-cyan animate-[pixel-blink_1s_steps(2)_infinite]" />
        )}
        {toolCount > 0 && (
          <span className="text-[10px] font-mono text-text-dim">
            [{runningTools > 0 ? `${runningTools}/${toolCount} tools` : `${toolCount} tools`}]
          </span>
        )}
        <span className={`ml-auto text-[11px] font-mono ${isRunning ? 'text-accent-cyan' : 'text-accent-green'}`}>
          {isRunning ? 'Running...' : 'Done'}
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
                  <span className="text-[10px] font-pixel text-text-dim">TASK</span>
                  <pre className="mt-1 text-[11px] font-mono text-text-secondary bg-void p-2 overflow-x-auto whitespace-pre-wrap">
                    {task}
                  </pre>
                </div>
              )}

              {/* Tool calls */}
              {state.toolCalls.length > 0 && (
                <div className="mt-2 space-y-1">
                  <span className="text-[10px] font-pixel text-text-dim">TOOLS</span>
                  {state.toolCalls.map(tc => (
                    <SubAgentToolItem key={tc.id} tc={tc} />
                  ))}
                </div>
              )}

              {/* Output text */}
              {state.text && (
                <div className="mt-2">
                  <span className="text-[10px] font-pixel text-text-dim">OUTPUT</span>
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

// --- Main ToolCallDisplay ---

export function ToolCallDisplay({ toolInvocation }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false)
  const displayName = useToolDisplayName(toolInvocation.toolName)

  const status = getStatusLabel(toolInvocation.state)
  const hasOutput = toolInvocation.state === 'output-available'
  const hasError = toolInvocation.state === 'output-error'
  const isRunning = toolInvocation.state === 'input-streaming' || toolInvocation.state === 'input-available'

  // Check if this is a sub-agent with structured streaming output
  const isSubAgent = toolInvocation.toolName.startsWith(DELEGATE_PREFIX)
  const subAgentState = isSubAgent && isSubAgentStreamState(toolInvocation.output)
    ? toolInvocation.output
    : null

  if (subAgentState) {
    const taskInput = typeof toolInvocation.input === 'object' && toolInvocation.input !== null && 'task' in toolInvocation.input
      ? String((toolInvocation.input as { task: string }).task)
      : undefined
    return <SubAgentDisplay state={subAgentState} task={taskInput} />
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
                  <span className="text-[10px] font-pixel text-text-dim">INPUT</span>
                  <pre className="mt-1 text-[11px] font-mono text-text-secondary bg-void p-2 overflow-x-auto">
                    {JSON.stringify(toolInvocation.input, null, 2)}
                  </pre>
                </div>
              )}
              {/* Output */}
              {hasOutput && toolInvocation.output !== undefined && (
                <div className="mt-2">
                  <span className="text-[10px] font-pixel text-text-dim">OUTPUT</span>
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
                  <span className="text-[10px] font-pixel text-accent-red">ERROR</span>
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
