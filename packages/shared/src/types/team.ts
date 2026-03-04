import type { AgentId, ProjectId, TeamId, Timestamped } from './common'

export interface TeamMember {
  agentId: AgentId
  role: string
  parentAgentId?: AgentId // undefined = leader (top-level agent)
}

export interface Team extends Timestamped {
  id: TeamId
  projectId: ProjectId
  name: string
  description: string
  instruction?: string // injected into leader agent systemPrompt as team context
  members: TeamMember[]
  layout?: Record<string, { x: number; y: number }> // topology node positions
}
