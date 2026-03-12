import type { AgentId, ChatTarget, TeamId } from '../types/common'
import type { Team } from '../types/team'

/**
 * Resolve the actual agentId from a ChatTarget.
 * - kind='agent': returns agentId directly
 * - kind='team': finds the team leader (member without parentAgentId)
 */
export function resolveTargetAgentId(
  target: ChatTarget,
  teams: Team[],
): AgentId | undefined {
  if (target.kind === 'agent') return target.agentId
  const team = teams.find((t) => t.id === target.teamId)
  if (!team) return undefined
  const leader = team.members.find((m) => !m.parentAgentId)
  return leader?.agentId
}

/**
 * Create a ChatTarget from legacy agentId + teamId? fields.
 * Used in migration and normalize() compatibility paths.
 */
export function chatTargetFromLegacy(agentId: AgentId, teamId?: TeamId): ChatTarget {
  if (teamId) return { kind: 'team', teamId }
  return { kind: 'agent', agentId }
}

/**
 * Structural equality comparison for ChatTarget values.
 */
export function chatTargetEquals(a: ChatTarget, b: ChatTarget): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'agent' && b.kind === 'agent') return a.agentId === b.agentId
  if (a.kind === 'team' && b.kind === 'team') return a.teamId === b.teamId
  return false
}
