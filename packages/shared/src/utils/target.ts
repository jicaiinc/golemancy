import type { AgentId, TeamId, TargetType } from '../types/common'
import type { Team } from '../types/team'

/**
 * Resolve the effective agent ID from a target.
 *
 * - If targetType is 'agent', returns targetId directly.
 * - If targetType is 'team', finds the leader agent (member without parentAgentId).
 *
 * @throws if targetType is 'team' but team is not provided or has no leader
 */
export function resolveAgentId(
  targetType: TargetType,
  targetId: AgentId | TeamId,
  team?: Team,
): AgentId {
  if (targetType === 'agent') {
    return targetId as AgentId
  }

  // targetType === 'team'
  if (!team) {
    throw new Error(`Cannot resolve agent from team target ${targetId}: team not provided`)
  }
  const leader = team.members.find(m => !m.parentAgentId)
  if (!leader) {
    throw new Error(`Team ${team.id} has no leader agent`)
  }
  return leader.agentId
}
