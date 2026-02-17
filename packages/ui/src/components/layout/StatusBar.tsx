import type { PermissionMode } from '@golemancy/shared'

const MODE_STYLES: Record<PermissionMode, { label: string; className: string }> = {
  restricted: { label: 'Restricted', className: 'text-accent-amber' },
  sandbox: { label: 'Sandbox', className: 'text-accent-green' },
  unrestricted: { label: 'Unrestricted', className: 'text-accent-red' },
}

interface StatusBarProps {
  permissionMode?: PermissionMode
  actualMode?: PermissionMode
  tokenUsage?: string
  activeAgents?: number
}

export function StatusBar({ permissionMode, actualMode, tokenUsage = '0', activeAgents = 0 }: StatusBarProps) {
  const modeStyle = permissionMode ? MODE_STYLES[permissionMode] : null

  return (
    <footer className="h-6 shrink-0 flex items-center justify-between px-4 bg-deep border-t-2 border-border-dim">
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

      {/* Right: token usage + agents */}
      <div className="flex items-center gap-4">
        <span className="font-mono text-[11px] text-text-dim">
          Token Usage: {tokenUsage} today
        </span>
        <span className="font-mono text-[11px] text-text-dim">
          {activeAgents} agent{activeAgents !== 1 ? 's' : ''} running
        </span>
      </div>
    </footer>
  )
}
