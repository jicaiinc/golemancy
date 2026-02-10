import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { ToolCallResult } from '@solocraft/shared'

interface ToolCallDisplayProps {
  toolCall: ToolCallResult
}

export function ToolCallDisplay({ toolCall }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false)

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
          {toolCall.toolName}
        </span>
        <span className="ml-auto text-[11px] text-text-dim font-mono">
          {toolCall.duration}ms
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
              <div className="mt-2">
                <span className="text-[10px] font-pixel text-text-dim">INPUT</span>
                <pre className="mt-1 text-[11px] font-mono text-text-secondary bg-void p-2 overflow-x-auto">
                  {JSON.stringify(toolCall.input, null, 2)}
                </pre>
              </div>
              {/* Output */}
              <div className="mt-2">
                <span className="text-[10px] font-pixel text-text-dim">OUTPUT</span>
                <pre className="mt-1 text-[11px] font-mono text-text-secondary bg-void p-2 overflow-x-auto">
                  {toolCall.output}
                </pre>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
