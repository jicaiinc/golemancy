import type { SkillId, ProjectId, Timestamped } from './common'

export interface Skill extends Timestamped {
  id: SkillId
  projectId: ProjectId
  name: string
  description: string
  instructions: string
}

export type SkillCreateData = Pick<Skill, 'name' | 'description' | 'instructions'>
export type SkillUpdateData = Partial<SkillCreateData>
