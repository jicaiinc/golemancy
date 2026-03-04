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

      {/* Handles: top (target/parent input) + bottom (source/children output) — always visible */}
      <Handle type="target" position={Position.Top} className="!bg-border-bright !w-2 !h-2 !border-2 !border-border-dim !rounded-none" />
      <Handle type="source" position={Position.Bottom} className="!bg-border-bright !w-2 !h-2 !border-2 !border-border-dim !rounded-none" />
    </div>
  )
})

TeamNode.displayName = 'TeamNode'
