import { nanoid } from 'nanoid'
import type {
  ProjectId, AgentId, ConversationId, MessageId,
  TaskId, SkillId, CronJobId,
  PermissionsConfigId, TranscriptionId, MemoryId,
} from '@golemancy/shared'

type IdPrefix = 'proj' | 'agent' | 'conv' | 'msg' | 'task' | 'skill' | 'cron' | 'perm' | 'cronrun' | 'tkr' | 'compact' | 'trans' | 'mem'

type IdMap = {
  proj: ProjectId
  agent: AgentId
  conv: ConversationId
  msg: MessageId
  task: TaskId
  skill: SkillId
  cron: CronJobId
  perm: PermissionsConfigId
  cronrun: string
  tkr: string
  compact: string
  trans: TranscriptionId
  mem: MemoryId
}

export function generateId<P extends IdPrefix>(prefix: P): IdMap[P] {
  return `${prefix}-${nanoid(12)}` as IdMap[P]
}
