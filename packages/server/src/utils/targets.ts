import type { AgentId, ITeamService, ProjectId, TargetRef } from '@golemancy/shared'

export async function resolveExecutionAgentId(
  teamStorage: ITeamService,
  projectId: ProjectId,
  target: TargetRef,
): Promise<AgentId> {
  if (target.kind === 'agent') {
    return target.id
  }

  const team = await teamStorage.getById(projectId, target.id)
  if (!team) {
    throw new Error(`Team ${target.id} not found`)
  }

  const leader = team.members.find(member => !member.parentAgentId)
  if (!leader) {
    throw new Error(`Team ${target.id} has no leader`)
  }

  return leader.agentId
}
