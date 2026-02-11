import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'

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

export function ToolCallDisplay({ toolInvocation }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false)

  const status = getStatusLabel(toolInvocation.state)
  const hasOutput = toolInvocation.state === 'output-available'
  const hasError = toolInvocation.state === 'output-error'
  const isRunning = toolInvocation.state === 'input-streaming' || toolInvocation.state === 'input-available'

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
          {toolInvocation.toolName}
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
