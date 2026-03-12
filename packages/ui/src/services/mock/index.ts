import type { ServiceContainer } from '../container'
import {
  MockProjectService,
  MockAgentService,
  MockConversationService,
  MockTaskService,
  MockWorkspaceService,
  MockSkillService,
  MockMCPService,
  MockSettingsService,
  MockCronJobService,
  MockDashboardService,
  MockGlobalDashboardService,
  MockPermissionsConfigService,
  MockMemoryService,
  MockTeamService,
} from './services'
import { MockSpeechService } from './speech'

export function createMockServices(): ServiceContainer {
  const agents = new MockAgentService()
  const teams = new MockTeamService()
  return {
    projects: new MockProjectService(),
    agents,
    conversations: new MockConversationService(teams),
    tasks: new MockTaskService(),
    workspace: new MockWorkspaceService(),
    skills: new MockSkillService(agents),
    mcp: new MockMCPService(agents),
    settings: new MockSettingsService(),
    cronJobs: new MockCronJobService(teams),
    dashboard: new MockDashboardService(),
    globalDashboard: new MockGlobalDashboardService(),
    permissionsConfig: new MockPermissionsConfigService(),
    speech: new MockSpeechService(),
    memories: new MockMemoryService(),
    teams,
  }
}
