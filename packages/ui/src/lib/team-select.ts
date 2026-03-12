import type { AgentId, TeamId } from '@golemancy/shared'

const TEAM_PREFIX = 'team:'

/** Encode a TeamId as a select option value */
export function encodeTeamValue(teamId: TeamId): string {
  return `${TEAM_PREFIX}${teamId}`
}

/** Decode a select option value — returns { teamId } or { agentId } */
export function decodeSelectValue(value: string): { teamId: TeamId } | { agentId: AgentId } | null {
  if (!value) return null
  if (value.startsWith(TEAM_PREFIX)) {
    return { teamId: value.slice(TEAM_PREFIX.length) as TeamId }
  }
  return { agentId: value as AgentId }
}
