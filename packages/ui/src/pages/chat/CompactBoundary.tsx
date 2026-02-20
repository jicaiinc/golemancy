import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { CompactRecord } from '@golemancy/shared'

interface CompactBoundaryProps {
  compact: CompactRecord
}

export function CompactBoundary({ compact }: CompactBoundaryProps) {
  const [expanded, setExpanded] = useState(false)

  // Format token counts
  const formatTokens = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)

  return (
    <div className="my-3 border-2 border-accent-purple/50 bg-accent-purple/5">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer hover:bg-accent-purple/10 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[10px] text-accent-purple/60 font-mono select-none">
          {expanded ? '[-]' : '[+]'}
        </span>
        <span className="font-pixel text-[10px] text-accent-purple">
          CONVERSATION COMPACTED
        </span>
        <span className="text-[10px] font-mono text-text-dim ml-1">
          [{compact.trigger}]
        </span>
        <span className="ml-auto text-[10px] font-mono text-text-dim">
          {formatTokens(compact.inputTokens)} in / {formatTokens(compact.outputTokens)} out
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
            <div className="px-3 pb-3 border-t-2 border-accent-purple/30">
              <div className="mt-2">
                <span className="text-[9px] font-pixel text-text-dim">SUMMARY</span>
                <pre className="mt-1 text-[11px] font-mono text-text-secondary bg-void p-2 overflow-x-auto whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                  {compact.summary}
                </pre>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
