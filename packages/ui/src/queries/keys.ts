import type { ProjectId, AgentId, CronJobId } from '@golemancy/shared'

export const queryKeys = {
  agents:      { all: (pid: ProjectId) => ['agents', pid] as const },
  teams:       { all: (pid: ProjectId) => ['teams', pid] as const },
  skills:      { all: (pid: ProjectId) => ['skills', pid] as const },
  mcpServers:  { all: (pid: ProjectId) => ['mcpServers', pid] as const },
  cronJobs:    { all: (pid: ProjectId) => ['cronJobs', pid] as const },
  cronJobRuns: { all: (pid: ProjectId, jid: CronJobId) => ['cronJobRuns', pid, jid] as const },
  memories:    { all: (pid: ProjectId, aid: AgentId) => ['memories', pid, aid] as const },
  tasks:       { all: (pid: ProjectId) => ['tasks', pid] as const },
}
