import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { AgentId, AgentStatus } from '@golemancy/shared'
import { PixelAvatar, PixelBadge } from '../../../components'

export interface AgentNodeData extends Record<string, unknown> {
  agentId: AgentId
  name: string
  status: AgentStatus
  model: string
  skillCount: number
  toolCount: number
  subAgentCount: number
  isMainAgent: boolean
}

export type AgentNodeType = Node<AgentNodeData, 'agentNode'>

const statusBarColor: Record<AgentStatus, string> = {
  idle: 'bg-text-secondary',
  running: 'bg-accent-green',
  error: 'bg-accent-red',
  paused: 'bg-accent-amber',
}

const statusAnimation: Record<AgentStatus, string> = {
  idle: '',
  running: 'animate-[pixel-pulse_1s_steps(2)_infinite]',
  error: 'animate-[pixel-shake_0.3s_steps(3)_infinite]',
  paused: 'animate-[pixel-blink_2s_steps(2)_infinite]',
}

const statusBadgeVariant: Record<AgentStatus, 'idle' | 'running' | 'error' | 'paused'> = {
  idle: 'idle',
  running: 'running',
  error: 'error',
  paused: 'paused',
}

function mapStatus(status: AgentStatus): 'online' | 'error' | 'paused' | 'offline' {
  if (status === 'running') return 'online'
  if (status === 'error') return 'error'
  if (status === 'paused') return 'paused'
  return 'offline'
}

export const AgentNode = memo(({ data, selected }: NodeProps<AgentNodeType>) => {
  return (
    <div className={`
      w-[240px] bg-surface border-2 relative overflow-hidden cursor-pointer transition-colors
      shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_0_rgba(0,0,0,0.3)]
      ${selected
        ? 'bg-elevated border-accent-blue shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_0_rgba(0,0,0,0.3),4px_4px_0_0_rgba(0,0,0,0.5),0_0_0_2px_rgba(96,165,250,0.3)]'
        : data.isMainAgent
          ? 'border-mc-gold/60'
          : 'border-border-dim'
      }
    `}>
      {/* Status bar */}
      <div className={`h-1 w-full ${statusBarColor[data.status]} ${statusAnimation[data.status]}`} />

      {/* Main agent label */}
      {data.isMainAgent && (
        <div className="px-3 pt-1.5">
          <span className="font-pixel text-[8px] text-mc-gold">MAIN</span>
        </div>
      )}

      {/* Content */}
      <div className="p-3 pt-2">
        <div className="flex items-center gap-2">
          <PixelAvatar
            size="sm"
            initials={data.name}
            status={mapStatus(data.status)}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-pixel text-[10px] text-text-primary truncate">
                {data.name}
              </span>
              <PixelBadge variant={statusBadgeVariant[data.status]}>
                {data.status}
              </PixelBadge>
            </div>
            {data.model && (
              <div className="font-mono text-[11px] text-text-dim mt-0.5 truncate">
                {data.model}
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t-2 border-border-dim my-2" />

        {/* Meta counts */}
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          {data.skillCount > 0 && (
            <span className="text-text-secondary">
              {data.skillCount} skill{data.skillCount !== 1 ? 's' : ''}
            </span>
          )}
          {data.toolCount > 0 && (
            <span className="text-text-secondary">
              {data.toolCount} tool{data.toolCount !== 1 ? 's' : ''}
            </span>
          )}
          {data.subAgentCount > 0 && (
            <span className="text-accent-purple">
              {data.subAgentCount} sub-agent{data.subAgentCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Handles — square pixel style */}
      <Handle type="target" position={Position.Top} className="!bg-border-bright !w-2 !h-2 !border-2 !border-border-dim !rounded-none" />
      <Handle type="source" position={Position.Bottom} className="!bg-border-bright !w-2 !h-2 !border-2 !border-border-dim !rounded-none" />
    </div>
  )
})

AgentNode.displayName = 'AgentNode'
