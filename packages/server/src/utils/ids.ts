import { nanoid } from 'nanoid'
import type {
  ProjectId, AgentId, ConversationId, MessageId,
  TaskId, MemoryId, SkillId, CronJobId,
  PermissionsConfigId,
} from '@golemancy/shared'

type IdPrefix = 'proj' | 'agent' | 'conv' | 'msg' | 'task' | 'mem' | 'skill' | 'cron' | 'perm' | 'cronrun' | 'tkr' | 'compact'

type IdMap = {
  proj: ProjectId
  agent: AgentId
  conv: ConversationId
  msg: MessageId
  task: TaskId
  mem: MemoryId
  skill: SkillId
  cron: CronJobId
  perm: PermissionsConfigId
  cronrun: string
  tkr: string
  compact: string
}

export function generateId<P extends IdPrefix>(prefix: P): IdMap[P] {
  return `${prefix}-${nanoid(12)}` as IdMap[P]
}
