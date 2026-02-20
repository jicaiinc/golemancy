import type { ServiceContainer } from '../container'
import {
  HttpProjectService,
  HttpAgentService,
  HttpConversationService,
  HttpTaskService,
  HttpWorkspaceService,
  HttpMemoryService,
  HttpSkillService,
  HttpMCPService,
  HttpSettingsService,
  HttpCronJobService,
  HttpDashboardService,
  HttpGlobalDashboardService,
  HttpPermissionsConfigService,
} from './services'

export function createHttpServices(baseUrl: string): ServiceContainer {
  return {
    projects: new HttpProjectService(baseUrl),
    agents: new HttpAgentService(baseUrl),
    conversations: new HttpConversationService(baseUrl),
    tasks: new HttpTaskService(baseUrl),
    workspace: new HttpWorkspaceService(baseUrl),
    memory: new HttpMemoryService(baseUrl),
    skills: new HttpSkillService(baseUrl),
    mcp: new HttpMCPService(baseUrl),
    settings: new HttpSettingsService(baseUrl),
    cronJobs: new HttpCronJobService(baseUrl),
    dashboard: new HttpDashboardService(baseUrl),
    globalDashboard: new HttpGlobalDashboardService(baseUrl),
    permissionsConfig: new HttpPermissionsConfigService(baseUrl),
  }
}

export { HttpProjectService, HttpAgentService, HttpConversationService, HttpTaskService, HttpWorkspaceService, HttpMemoryService, HttpSkillService, HttpMCPService, HttpSettingsService, HttpCronJobService, HttpDashboardService, HttpGlobalDashboardService, HttpPermissionsConfigService } from './services'
export { setAuthToken, getAuthToken, setBaseUrl, getBaseUrl } from './base'
