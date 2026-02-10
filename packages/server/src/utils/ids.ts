import { nanoid } from 'nanoid'
import type {
  ProjectId, AgentId, ConversationId, MessageId,
  TaskId, ArtifactId, MemoryId,
} from '@solocraft/shared'

type IdPrefix = 'proj' | 'agent' | 'conv' | 'msg' | 'task' | 'art' | 'mem'

type IdMap = {
  proj: ProjectId
  agent: AgentId
  conv: ConversationId
  msg: MessageId
  task: TaskId
  art: ArtifactId
  mem: MemoryId
}

export function generateId<P extends IdPrefix>(prefix: P): IdMap[P] {
  return `${prefix}-${nanoid(12)}` as IdMap[P]
}
