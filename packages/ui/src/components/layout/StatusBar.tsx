import { useState, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { PermissionMode, ConversationTask } from '@golemancy/shared'

const MODE_STYLES: Record<PermissionMode, { label: string; className: string }> = {
  restricted: { label: 'Restricted', className: 'text-accent-amber' },
  sandbox: { label: 'Sandbox', className: 'text-accent-green' },
  unrestricted: { label: 'Unrestricted', className: 'text-accent-red' },
}

interface StatusBarProps {
  permissionMode?: PermissionMode
  actualMode?: PermissionMode
  tokenUsage?: { inputTokens: number; outputTokens: number } | null
  taskSummary?: { completed: number; total: number } | null
  taskList?: ConversationTask[]
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString()
}

export function StatusBar({ permissionMode, actualMode, tokenUsage, taskSummary, taskList }: StatusBarProps) {
  const modeStyle = permissionMode ? MODE_STYLES[permissionMode] : null
  const [showTaskPopover, setShowTaskPopover] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showTaskPopover) return
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowTaskPopover(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showTaskPopover])

  return (
    <footer className="h-6 shrink-0 flex items-center justify-between px-4 bg-deep border-t-2 border-border-dim relative">
      {/* Left: permission mode */}
      <span className="font-mono text-[11px]">
        {modeStyle ? (
          <>
            <span className={modeStyle.className}>{modeStyle.label}</span>
            {actualMode && actualMode !== permissionMode && (
              <span className="text-accent-amber text-[10px] ml-1">
                (degraded → {MODE_STYLES[actualMode].label})
              </span>
            )}
          </>
        ) : (
          <span className="text-text-dim">--</span>
        )}
      </span>

      {/* Right: tasks + token usage + agents */}
      <div className="flex items-center gap-4">
        {taskSummary && taskSummary.total > 0 && (
          <div className="relative" ref={popoverRef}>
            <button
              className="font-mono text-[11px] text-accent-cyan cursor-pointer hover:text-accent-blue transition-colors"
              data-testid="task-summary-btn"
              onClick={() => setShowTaskPopover(v => !v)}
            >
              Tasks {taskSummary.completed}/{taskSummary.total}
            </button>
            <AnimatePresence>
              {showTaskPopover && taskList && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute bottom-7 right-0 w-[28rem] bg-elevated border-2 border-border-dim shadow-pixel-drop z-50"
                  data-testid="task-popover"
                >
                  <div className="px-3 py-2 border-b-2 border-border-dim">
                    <span className="font-pixel text-[9px] text-text-dim">CONVERSATION TASKS</span>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {taskList.filter(t => t.status !== 'deleted').map(t => (
                      <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-deep/50">
                        <span className="text-[12px] font-mono">
                          {t.status === 'completed' ? '\u2611' : t.status === 'in_progress' ? '\u25B6' : '\u2610'}
                        </span>
                        <span className={`text-[11px] font-mono flex-1 truncate ${
                          t.status === 'completed' ? 'text-text-dim line-through' : 'text-text-primary'
                        }`}>
                          {t.subject}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        <span className="font-mono text-[11px] text-text-dim">
          {tokenUsage
            ? `Tokens: ${formatTokenCount(tokenUsage.inputTokens)} in / ${formatTokenCount(tokenUsage.outputTokens)} out`
            : 'Tokens: --'}
        </span>
      </div>
    </footer>
  )
}
