import { nanoid } from 'nanoid'
import type {
  ProjectId, AgentId, ConversationId, MessageId,
  TaskId, KBCollectionId, KBDocumentId, SkillId, CronJobId,
  PermissionsConfigId, TranscriptionId,
} from '@golemancy/shared'

type IdPrefix = 'proj' | 'agent' | 'conv' | 'msg' | 'task' | 'kbc' | 'kbd' | 'kbchk' | 'skill' | 'cron' | 'perm' | 'cronrun' | 'tkr' | 'compact' | 'trans'

type IdMap = {
  proj: ProjectId
  agent: AgentId
  conv: ConversationId
  msg: MessageId
  task: TaskId
  kbc: KBCollectionId
  kbd: KBDocumentId
  kbchk: string
  skill: SkillId
  cron: CronJobId
  perm: PermissionsConfigId
  cronrun: string
  tkr: string
  compact: string
  trans: TranscriptionId
}

export function generateId<P extends IdPrefix>(prefix: P): IdMap[P] {
  return `${prefix}-${nanoid(12)}` as IdMap[P]
}
