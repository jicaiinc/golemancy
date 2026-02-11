import { nanoid } from 'nanoid'
import type {
  ProjectId, AgentId, ConversationId, MessageId,
  TaskId, ArtifactId, MemoryId, SkillId, CronJobId,
} from '@solocraft/shared'

type IdPrefix = 'proj' | 'agent' | 'conv' | 'msg' | 'task' | 'art' | 'mem' | 'skill' | 'cron'

type IdMap = {
  proj: ProjectId
  agent: AgentId
  conv: ConversationId
  msg: MessageId
  task: TaskId
  art: ArtifactId
  mem: MemoryId
  skill: SkillId
  cron: CronJobId
}

export function generateId<P extends IdPrefix>(prefix: P): IdMap[P] {
  return `${prefix}-${nanoid(12)}` as IdMap[P]
}
