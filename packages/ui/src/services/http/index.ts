import type { ServiceContainer } from '../container'
import {
  HttpProjectService,
  HttpAgentService,
  HttpConversationService,
  HttpTaskService,
  HttpArtifactService,
  HttpMemoryService,
  HttpSkillService,
  HttpMCPService,
  HttpSettingsService,
  HttpCronJobService,
  HttpDashboardService,
} from './services'

export function createHttpServices(baseUrl: string): ServiceContainer {
  return {
    projects: new HttpProjectService(baseUrl),
    agents: new HttpAgentService(baseUrl),
    conversations: new HttpConversationService(baseUrl),
    tasks: new HttpTaskService(baseUrl),
    artifacts: new HttpArtifactService(baseUrl),
    memory: new HttpMemoryService(baseUrl),
    skills: new HttpSkillService(baseUrl),
    mcp: new HttpMCPService(baseUrl),
    settings: new HttpSettingsService(baseUrl),
    cronJobs: new HttpCronJobService(baseUrl),
    dashboard: new HttpDashboardService(baseUrl),
  }
}

export { HttpProjectService, HttpAgentService, HttpConversationService, HttpTaskService, HttpArtifactService, HttpMemoryService, HttpSkillService, HttpMCPService, HttpSettingsService, HttpCronJobService, HttpDashboardService } from './services'
export { setAuthToken, getAuthToken } from './base'
