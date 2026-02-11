import type { ServiceContainer } from '../container'
import {
  MockProjectService,
  MockAgentService,
  MockConversationService,
  MockTaskService,
  MockArtifactService,
  MockMemoryService,
  MockSettingsService,
  MockCronJobService,
  MockDashboardService,
} from './services'
import { SEED_PROJECTS, SEED_AGENTS, SEED_TASKS, SEED_ACTIVITIES } from './data'

export function createMockServices(): ServiceContainer {
  return {
    projects: new MockProjectService(),
    agents: new MockAgentService(),
    conversations: new MockConversationService(),
    tasks: new MockTaskService(),
    artifacts: new MockArtifactService(),
    memory: new MockMemoryService(),
    settings: new MockSettingsService(),
    cronJobs: new MockCronJobService(),
    dashboard: new MockDashboardService(SEED_PROJECTS, SEED_AGENTS, SEED_TASKS, SEED_ACTIVITIES),
  }
}
