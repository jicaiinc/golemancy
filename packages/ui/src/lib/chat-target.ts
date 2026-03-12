import type { Agent, ChatTarget, Team } from '@golemancy/shared'
import { resolveTargetAgentId } from '@golemancy/shared'

/** Serialize ChatTarget → select value string */
export function encodeChatTarget(target: ChatTarget): string {
  return target.kind === 'agent'
    ? target.agentId
    : `team:${target.teamId}`
}

/** Deserialize select value string → ChatTarget */
export function decodeChatTarget(value: string): ChatTarget | null {
  if (!value) return null
  if (value.startsWith('team:')) {
    return { kind: 'team', teamId: value.slice(5) as import('@golemancy/shared').TeamId }
  }
  return { kind: 'agent', agentId: value as import('@golemancy/shared').AgentId }
}

/** Get display name for a ChatTarget */
export function getTargetDisplayName(
  target: ChatTarget,
  agents: Pick<Agent, 'id' | 'name'>[],
  teams: Pick<Team, 'id' | 'name'>[],
): string {
  if (target.kind === 'team') {
    const team = teams.find(t => t.id === target.teamId)
    return team?.name ?? 'Unknown Team'
  }
  const agent = agents.find(a => a.id === target.agentId)
  return agent?.name ?? 'Unknown Agent'
}

export { resolveTargetAgentId }
