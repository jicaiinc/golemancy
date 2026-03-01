import { useState, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { PermissionMode, ConversationTask, ConversationTokenUsageResult } from '@golemancy/shared'

const MODE_CLASS: Record<PermissionMode, string> = {
  restricted: 'text-accent-amber',
  sandbox: 'text-accent-green',
  unrestricted: 'text-accent-red',
}

interface StatusBarProps {
  permissionMode?: PermissionMode
  actualMode?: PermissionMode
  tokenUsage?: { inputTokens: number; outputTokens: number } | null
  tokenBreakdown?: ConversationTokenUsageResult | null
  taskSummary?: { completed: number; total: number } | null
  taskList?: ConversationTask[]
  contextTokens?: number | null
  compactThreshold?: number | null
  onCompactNow?: () => Promise<void>
  compacting?: boolean
  compactSource?: 'auto' | 'manual' | null
  onCancelCompact?: () => void
  chatBusy?: boolean
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString()
}

export function StatusBar({ permissionMode, actualMode, tokenUsage, tokenBreakdown, taskSummary, taskList, contextTokens, compactThreshold, onCompactNow, compacting, compactSource, onCancelCompact, chatBusy }: StatusBarProps) {
  const { t } = useTranslation(['nav', 'common'])
  const modeClass = permissionMode ? MODE_CLASS[permissionMode] : null
  const getModeLabel = (mode: PermissionMode) => t(`nav:statusBar.mode.${mode}`)

  const [showTaskPopover, setShowTaskPopover] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [showTokenPopover, setShowTokenPopover] = useState(false)
  const tokenPopoverRef = useRef<HTMLDivElement>(null)
  const [showContextPopover, setShowContextPopover] = useState(false)
  const contextPopoverRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (!showTokenPopover) return
    function handleClick(e: MouseEvent) {
      if (tokenPopoverRef.current && !tokenPopoverRef.current.contains(e.target as Node)) {
        setShowTokenPopover(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showTokenPopover])

  useEffect(() => {
    if (!showContextPopover) return
    function handleClick(e: MouseEvent) {
      if (contextPopoverRef.current && !contextPopoverRef.current.contains(e.target as Node)) {
        setShowContextPopover(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showContextPopover])

  const contextPercent = contextTokens != null && compactThreshold ? Math.round((contextTokens / compactThreshold) * 100) : null
  const contextColorClass = contextPercent == null ? 'text-text-dim'
    : contextPercent > 100 ? 'text-accent-red'
    : contextPercent >= 80 ? 'text-accent-amber'
    : 'text-text-dim'

  return (
    <footer className="h-6 shrink-0 flex items-center justify-between px-4 bg-deep border-t-2 border-border-dim relative">
      {/* Left: permission mode */}
      <span className="font-mono text-[11px]">
        {modeClass ? (
          <>
            <span className={modeClass}>{getModeLabel(permissionMode!)}</span>
            {actualMode && actualMode !== permissionMode && (
              <span className="text-accent-amber text-[10px] ml-1">
                {t('nav:statusBar.degraded', { mode: getModeLabel(actualMode) })}
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
              {t('nav:statusBar.tasks', { completed: taskSummary.completed, total: taskSummary.total })}
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
                    <span className="font-pixel text-[9px] text-text-dim">{t('nav:statusBar.conversationTasks')}</span>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {taskList.filter(item => item.status !== 'deleted').map(task => (
                      <div key={task.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-deep/50">
                        <span className="text-[12px] font-mono">
                          {task.status === 'completed' ? '\u2611' : task.status === 'in_progress' ? '\u25B6' : '\u2610'}
                        </span>
                        <span className={`text-[11px] font-mono flex-1 truncate ${
                          task.status === 'completed' ? 'text-text-dim line-through' : 'text-text-primary'
                        }`}>
                          {task.subject}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        {compactThreshold != null && (
          <div className="relative" ref={contextPopoverRef}>
            <button
              className={`font-mono text-[11px] cursor-pointer hover:text-accent-blue transition-colors ${contextColorClass}`}
              data-testid="context-window-btn"
              onClick={() => setShowContextPopover(v => !v)}
            >
              {contextTokens != null
                ? t('nav:statusBar.contextUsage', {
                    used: formatTokenCount(contextTokens),
                    max: formatTokenCount(compactThreshold),
                    percent: contextPercent,
                  })
                : t('nav:statusBar.contextEmpty', { max: formatTokenCount(compactThreshold) })}
            </button>
            <AnimatePresence>
              {showContextPopover && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute bottom-7 right-0 w-72 bg-elevated border-2 border-border-dim shadow-pixel-drop z-50"
                  data-testid="context-popover"
                >
                  <div className="px-3 py-2 border-b-2 border-border-dim">
                    <span className="font-pixel text-[9px] text-text-dim">{t('nav:statusBar.contextWindow')}</span>
                  </div>
                  <div className="px-3 py-3 space-y-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-text-dim">{t('nav:statusBar.usage')}</span>
                        <span className={contextColorClass}>
                          {contextTokens != null ? `${formatTokenCount(contextTokens)} / ${formatTokenCount(compactThreshold)}` : '--'}
                        </span>
                      </div>
                      <div className="h-3 bg-deep border-2 border-border-dim shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3)]">
                        <div
                          className={`h-full transition-[width] duration-300 ${
                            contextPercent != null && contextPercent > 100 ? 'bg-accent-red'
                            : contextPercent != null && contextPercent >= 80 ? 'bg-accent-amber'
                            : 'bg-accent-green'
                          }`}
                          style={{ width: `${Math.min(contextPercent ?? 0, 100)}%` }}
                        />
                      </div>
                      {contextPercent != null && (
                        <div className={`text-right text-[10px] font-mono ${contextColorClass}`}>
                          {contextPercent}%
                        </div>
                      )}
                    </div>
                    {compacting ? (
                      <div className="space-y-2">
                        <div className="w-full flex items-center justify-center gap-2 h-7 px-3 bg-accent-purple/10 border-2 border-accent-purple/40">
                          <span className="inline-block w-2 h-2 bg-accent-purple animate-pulse" />
                          <span className="font-mono text-[11px] text-accent-purple">
                            {compactSource === 'auto' ? t('nav:statusBar.compactingAuto') : t('nav:statusBar.compacting')}
                          </span>
                        </div>
                        {compactSource === 'manual' && (
                          <button
                            className="w-full inline-flex items-center justify-center font-mono cursor-pointer transition-transform bg-elevated text-text-secondary border-2 border-border-dim shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_0_rgba(0,0,0,0.3)] hover:brightness-110 hover:text-accent-red active:shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3)] active:translate-y-[2px] h-7 px-3 text-[11px]"
                            onClick={onCancelCompact}
                          >
                            {t('common:button.cancel')}
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        className={`w-full inline-flex items-center justify-center font-mono transition-transform border-2 h-7 px-3 text-[11px] ${
                          chatBusy
                            ? 'bg-elevated text-text-dim border-border-dim cursor-not-allowed opacity-50'
                            : 'bg-accent-green text-void border-accent-green cursor-pointer shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.2),inset_-2px_-2px_0_0_rgba(0,0,0,0.3)] hover:brightness-110 active:shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.2),inset_2px_2px_0_0_rgba(0,0,0,0.3)] active:translate-y-[2px]'
                        }`}
                        disabled={chatBusy}
                        onClick={async () => {
                          if (onCompactNow) {
                            await onCompactNow()
                            setShowContextPopover(false)
                          }
                        }}
                      >
                        {t('nav:statusBar.compactNow')}
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        <div className="relative" ref={tokenPopoverRef}>
          <button
            className="font-mono text-[11px] text-text-dim cursor-pointer hover:text-accent-blue transition-colors"
            onClick={() => setShowTokenPopover(v => !v)}
          >
            {tokenUsage
              ? t('nav:statusBar.tokens', {
                  input: formatTokenCount(tokenUsage.inputTokens),
                  output: formatTokenCount(tokenUsage.outputTokens),
                })
              : t('nav:statusBar.tokensEmpty')}
          </button>
          <AnimatePresence>
            {showTokenPopover && tokenBreakdown && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.12 }}
                className="absolute bottom-7 right-0 w-[28rem] bg-elevated border-2 border-border-dim shadow-pixel-drop z-50"
              >
                {/* BY AGENT section */}
                <div className="px-3 py-2 border-b-2 border-border-dim">
                  <span className="font-pixel text-[9px] text-text-dim">{t('nav:statusBar.byAgent')}</span>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {tokenBreakdown.byAgent.map(a => (
                    <div key={a.agentId} className="flex items-center justify-between px-3 py-1.5 hover:bg-deep/50">
                      <span className="text-[11px] font-mono text-text-primary truncate flex-1">{a.name}</span>
                      <span className="text-[11px] font-mono text-text-dim ml-2">
                        {t('nav:statusBar.tokensInOut', {
                          input: formatTokenCount(a.inputTokens),
                          output: formatTokenCount(a.outputTokens),
                        })}
                      </span>
                    </div>
                  ))}
                  {tokenBreakdown.byAgent.length === 0 && (
                    <div className="px-3 py-2 text-[11px] font-mono text-text-dim">{t('common:empty.noData')}</div>
                  )}
                </div>

                {/* BY MODEL section */}
                <div className="px-3 py-2 border-b-2 border-border-dim border-t-2">
                  <span className="font-pixel text-[9px] text-text-dim">{t('nav:statusBar.byModel')}</span>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {tokenBreakdown.byModel.map(m => (
                    <div key={`${m.provider}/${m.model}`} className="flex items-center justify-between px-3 py-1.5 hover:bg-deep/50">
                      <span className="text-[11px] font-mono text-accent-cyan truncate flex-1">{m.provider}/{m.model}</span>
                      <span className="text-[11px] font-mono text-text-dim ml-2">
                        {t('nav:statusBar.tokensInOut', {
                          input: formatTokenCount(m.inputTokens),
                          output: formatTokenCount(m.outputTokens),
                        })}
                      </span>
                    </div>
                  ))}
                  {tokenBreakdown.byModel.length === 0 && (
                    <div className="px-3 py-2 text-[11px] font-mono text-text-dim">{t('common:empty.noData')}</div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </footer>
  )
}
