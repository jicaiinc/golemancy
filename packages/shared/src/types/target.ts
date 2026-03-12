import type { AgentId, TeamId } from './common'

export interface AgentTargetRef {
  kind: 'agent'
  id: AgentId
}

export interface TeamTargetRef {
  kind: 'team'
  id: TeamId
}

export type TargetRef = AgentTargetRef | TeamTargetRef

export function isAgentTarget(target: TargetRef): target is AgentTargetRef {
  return target.kind === 'agent'
}

export function isTeamTarget(target: TargetRef): target is TeamTargetRef {
  return target.kind === 'team'
}
