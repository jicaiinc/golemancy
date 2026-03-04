import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { AgentId, AgentStatus } from '@golemancy/shared'

export interface TeamNodeData extends Record<string, unknown> {
  agentId: AgentId
  name: string
  status: AgentStatus
  model: string
  description: string
  isLeader: boolean
  role: string
  skillNames: string[]
  enabledTools: string[]
  mcpServerNames: string[]
  memoryEnabled: boolean
  isHighlighted?: boolean
}

export type TeamNodeType = Node<TeamNodeData, 'teamNode'>

const statusDotColor: Record<AgentStatus, string> = {
  idle: 'bg-text-dim',
  running: 'bg-accent-green',
  error: 'bg-accent-red',
  paused: 'bg-accent-amber',
}

export const TeamNode = memo(({ data, selected }: NodeProps<TeamNodeType>) => {
  const borderClass = data.isLeader
    ? 'border-mc-gold'
    : selected
      ? 'border-accent-blue'
      : data.isHighlighted
        ? 'border-accent-green'
        : 'border-border-dim'

  const hasCapabilities = data.skillNames.length > 0 || data.enabledTools.length > 0 || data.mcpServerNames.length > 0 || data.memoryEnabled

  return (
    <div
      data-testid="team-topology-node"
      className={`w-[200px] bg-surface border-2 relative cursor-pointer transition-colors ${borderClass}`}
      style={{
        boxShadow: selected
          ? '0 0 0 2px color-mix(in srgb, var(--color-accent-blue) 30%, transparent)'
          : data.isLeader
            ? '0 0 0 1px color-mix(in srgb, var(--color-mc-gold) 20%, transparent)'
            : data.isHighlighted
              ? '0 0 0 2px color-mix(in srgb, var(--color-accent-green) 25%, transparent)'
              : 'none',
      }}
    >
      {/* Header: status dot + name + leader star */}
      <div className="px-2.5 py-1.5 flex items-center gap-1.5">
        <span className={`w-2 h-2 shrink-0 ${statusDotColor[data.status]}`} />
        <span className="font-pixel text-[9px] text-text-primary truncate flex-1">{data.name}</span>
        {data.isLeader && (
          <span className="font-pixel text-[8px] text-mc-gold leading-none">★</span>
        )}
      </div>

      {/* Model */}
      {data.model && (
        <div className="px-2.5 -mt-1 pb-1">
          <span className="font-mono text-[9px] text-text-dim truncate block">{data.model}</span>
        </div>
      )}

      {/* Capabilities */}
      {hasCapabilities && (
        <>
          <div className="border-t border-border-dim" />
          <div className="px-2.5 py-1.5 space-y-0.5">
            {data.skillNames.length > 0 && (
              <div className="font-mono text-[8px] text-accent-purple truncate flex items-center gap-1">
                <span className="shrink-0 opacity-60">&#x2726;</span>
                {data.skillNames.join(' · ')}
              </div>
            )}
            {data.enabledTools.length > 0 && (
              <div className="font-mono text-[8px] text-accent-green truncate flex items-center gap-1">
                <span className="shrink-0 opacity-60">&#x2692;</span>
                {data.enabledTools.join(' · ')}
              </div>
            )}
            {(data.mcpServerNames.length > 0 || data.memoryEnabled) && (
              <div className="font-mono text-[8px] text-text-dim flex items-center gap-2">
                {data.mcpServerNames.length > 0 && (
                  <span className="flex items-center gap-0.5"><span className="opacity-60">&#x26A1;</span> MCP:{data.mcpServerNames.length}</span>
                )}
                {data.memoryEnabled && <span className="flex items-center gap-0.5"><span className="opacity-60">&#x25CF;</span> Memory</span>}
              </div>
            )}
          </div>
        </>
      )}

      {/* Handles + add-child button */}
      {!data.isLeader && (
        <Handle type="target" position={Position.Top} className="!bg-border-bright !w-2 !h-2 !border-2 !border-border-dim !rounded-none" />
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-border-bright !w-2 !h-2 !border-2 !border-border-dim !rounded-none" />

      {/* "+" button to add child agent */}
      <button
        data-action="add-child"
        className="absolute -bottom-3 left-1/2 -translate-x-1/2 translate-y-full w-5 h-5 bg-deep border-2 border-border-dim hover:border-accent-blue hover:text-accent-blue text-text-dim text-[10px] leading-none flex items-center justify-center cursor-pointer transition-colors z-10"
        title="Add sub-agent"
      >
        +
      </button>
    </div>
  )
})

TeamNode.displayName = 'TeamNode'
