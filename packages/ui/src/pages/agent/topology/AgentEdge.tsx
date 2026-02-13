import { memo } from 'react'
import {
  BaseEdge,
  getSmoothStepPath,
  EdgeLabelRenderer,
  type Edge,
  type EdgeProps,
} from '@xyflow/react'

export interface AgentEdgeData extends Record<string, unknown> {
  role: string
}

export type AgentEdgeType = Edge<AgentEdgeData, 'agentEdge'>

export const AgentEdge = memo(({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data, selected,
}: EdgeProps<AgentEdgeType>) => {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
    borderRadius: 0, // pixel art: no rounded corners
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? 'var(--color-accent-cyan)' : 'var(--color-border-bright)',
          strokeWidth: selected ? 3 : 2,
        }}
      />
      {data?.role && (
        <EdgeLabelRenderer>
          <div
            className="absolute bg-deep border-2 border-border-dim px-1.5 py-0.5 font-mono text-[10px] text-accent-purple pointer-events-auto cursor-pointer hover:bg-surface nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            {data.role}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})

AgentEdge.displayName = 'AgentEdge'
