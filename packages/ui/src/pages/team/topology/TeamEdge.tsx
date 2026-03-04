import { memo } from 'react'
import {
  BaseEdge,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react'

export interface TeamEdgeData extends Record<string, unknown> {
  role: string
}

export type TeamEdgeType = Edge<TeamEdgeData, 'teamEdge'>

export const TeamEdge = memo(({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  selected,
}: EdgeProps<TeamEdgeType>) => {
  const [edgePath] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
    borderRadius: 0,
  })

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: selected ? 'var(--color-accent-cyan)' : 'var(--color-border-dim)',
        strokeWidth: selected ? 3 : 2,
      }}
    />
  )
})

TeamEdge.displayName = 'TeamEdge'
