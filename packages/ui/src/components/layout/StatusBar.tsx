interface StatusBarProps {
  tokenUsage?: string
  activeAgents?: number
}

export function StatusBar({ tokenUsage = '0', activeAgents = 0 }: StatusBarProps) {
  return (
    <footer className="h-6 shrink-0 flex items-center justify-between px-4 bg-deep border-t-2 border-border-dim">
      <span className="font-mono text-[11px] text-text-dim">
        Token Usage: {tokenUsage} today
      </span>
      <span className="font-mono text-[11px] text-text-dim">
        {activeAgents} agent{activeAgents !== 1 ? 's' : ''} running
      </span>
    </footer>
  )
}
