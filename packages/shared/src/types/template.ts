import type { BuiltinToolConfig } from './agent'
import type { MCPTransportType } from './mcp'
import type { TargetType } from './common'

export type TemplateCategory = 'starter' | 'productivity' | 'research' | 'creative' | 'development'

export interface TemplateSkill {
  refId: string
  name: string
  description: string
  instructions: string
}

export interface TemplateAgent {
  refId: string
  name: string
  description: string
  systemPrompt: string
  skillRefs?: string[]
  mcpRefs?: string[]
  builtinTools?: Partial<BuiltinToolConfig>
}

export interface TemplateTeamMember {
  agentRef: string
  parentAgentRef?: string
}

export interface TemplateTeam {
  refId: string
  name: string
  description: string
  instruction?: string
  members: TemplateTeamMember[]
}

export interface TemplateMCPServer {
  refId: string
  name: string
  description?: string
  transportType: MCPTransportType
  command?: string
  args?: string[]
  env?: Record<string, string>
}

export interface TemplateCronJob {
  refId: string
  name: string
  description: string
  schedule: string
  targetType: TargetType
  targetRef: string
  prompt: string
  enabled: boolean
}

export interface ProjectTemplate {
  id: string
  category: TemplateCategory
  icon: string
  name: string
  description: string
  tags: string[]
  featured?: boolean

  skills: TemplateSkill[]
  agents: TemplateAgent[]
  teams: TemplateTeam[]
  mcpServers: TemplateMCPServer[]
  cronJobs: TemplateCronJob[]

  defaultTarget: {
    type: TargetType
    ref: string
  }
}
