import { memo } from 'react'
import {
  BaseEdge,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react'

export type TeamEdgeType = Edge<Record<string, unknown>, 'teamEdge'>

const ARROW_MARKER_ID = 'team-edge-arrow'

/** SVG defs for arrow marker — rendered once in TeamTopologyView */
export function TeamEdgeArrowDefs() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }}>
      <defs>
        <marker
          id={ARROW_MARKER_ID}
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-border-dim)" />
        </marker>
        <marker
          id={`${ARROW_MARKER_ID}-selected`}
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-accent-cyan)" />
        </marker>
      </defs>
    </svg>
  )
}

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
      markerEnd={`url(#${ARROW_MARKER_ID}${selected ? '-selected' : ''})`}
      style={{
        stroke: selected ? 'var(--color-accent-cyan)' : 'var(--color-border-dim)',
        strokeWidth: selected ? 3 : 2,
      }}
    />
  )
})

TeamEdge.displayName = 'TeamEdge'
