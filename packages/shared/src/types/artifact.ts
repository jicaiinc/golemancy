import type { AgentId, ArtifactId, ProjectId, TaskId, Timestamped } from './common'

export type ArtifactType = 'text' | 'code' | 'image' | 'file' | 'data'

export interface Artifact extends Timestamped {
  id: ArtifactId
  projectId: ProjectId
  taskId?: TaskId
  agentId: AgentId
  title: string
  type: ArtifactType
  content: string
  mimeType?: string
  filePath?: string
  size: number // bytes
}
