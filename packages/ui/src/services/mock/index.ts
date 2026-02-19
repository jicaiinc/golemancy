import type { ServiceContainer } from '../container'
import {
  MockProjectService,
  MockAgentService,
  MockConversationService,
  MockTaskService,
  MockArtifactService,
  MockMemoryService,
  MockSkillService,
  MockMCPService,
  MockSettingsService,
  MockCronJobService,
  MockDashboardService,
  MockPermissionsConfigService,
} from './services'
import { SEED_PROJECTS, SEED_AGENTS, SEED_ACTIVITIES } from './data'

export function createMockServices(): ServiceContainer {
  const agents = new MockAgentService()
  return {
    projects: new MockProjectService(),
    agents,
    conversations: new MockConversationService(),
    tasks: new MockTaskService(),
    artifacts: new MockArtifactService(),
    memory: new MockMemoryService(),
    skills: new MockSkillService(agents),
    mcp: new MockMCPService(agents),
    settings: new MockSettingsService(),
    cronJobs: new MockCronJobService(),
    dashboard: new MockDashboardService(SEED_PROJECTS, SEED_AGENTS, SEED_ACTIVITIES),
    permissionsConfig: new MockPermissionsConfigService(),
  }
}
