import type { AgentId, TeamId, TargetType } from '@golemancy/shared'

const TEAM_PREFIX = 'team:'

/** Encode a TeamId as a select option value */
export function encodeTeamValue(teamId: TeamId): string {
  return `${TEAM_PREFIX}${teamId}`
}

/** Decode a select option value — returns unified { targetType, targetId } */
export function decodeSelectValue(value: string): { targetType: TargetType; targetId: AgentId | TeamId } | null {
  if (!value) return null
  if (value.startsWith(TEAM_PREFIX)) {
    return { targetType: 'team', targetId: value.slice(TEAM_PREFIX.length) as TeamId }
  }
  return { targetType: 'agent', targetId: value as AgentId }
}
