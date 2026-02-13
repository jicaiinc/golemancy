import type { AgentId } from '@solocraft/shared'

/** Layout position for a single node, persisted to server */
export interface TopologyNodePosition {
  x: number
  y: number
}

/** Full topology layout document persisted as JSON */
export type TopologyLayout = Record<AgentId, TopologyNodePosition>
