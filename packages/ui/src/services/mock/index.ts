import type { ServiceContainer } from '../container'
import {
  MockProjectService,
  MockAgentService,
  MockConversationService,
  MockTaskService,
  MockWorkspaceService,
  MockMemoryService,
  MockSkillService,
  MockMCPService,
  MockSettingsService,
  MockCronJobService,
  MockDashboardService,
  MockGlobalDashboardService,
  MockPermissionsConfigService,
} from './services'
export function createMockServices(): ServiceContainer {
  const agents = new MockAgentService()
  return {
    projects: new MockProjectService(),
    agents,
    conversations: new MockConversationService(),
    tasks: new MockTaskService(),
    workspace: new MockWorkspaceService(),
    memory: new MockMemoryService(),
    skills: new MockSkillService(agents),
    mcp: new MockMCPService(agents),
    settings: new MockSettingsService(),
    cronJobs: new MockCronJobService(),
    dashboard: new MockDashboardService(),
    globalDashboard: new MockGlobalDashboardService(),
    permissionsConfig: new MockPermissionsConfigService(),
  }
}
