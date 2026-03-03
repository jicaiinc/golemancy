import type { ServiceContainer } from '../container'
import {
  HttpProjectService,
  HttpAgentService,
  HttpConversationService,
  HttpTaskService,
  HttpWorkspaceService,
  HttpKnowledgeBaseService,
  HttpSkillService,
  HttpMCPService,
  HttpSettingsService,
  HttpCronJobService,
  HttpDashboardService,
  HttpGlobalDashboardService,
  HttpPermissionsConfigService,
} from './services'
import { HttpSpeechService } from './speech'

export function createHttpServices(baseUrl: string): ServiceContainer {
  return {
    projects: new HttpProjectService(baseUrl),
    agents: new HttpAgentService(baseUrl),
    conversations: new HttpConversationService(baseUrl),
    tasks: new HttpTaskService(baseUrl),
    workspace: new HttpWorkspaceService(baseUrl),
    knowledgeBase: new HttpKnowledgeBaseService(baseUrl),
    skills: new HttpSkillService(baseUrl),
    mcp: new HttpMCPService(baseUrl),
    settings: new HttpSettingsService(baseUrl),
    cronJobs: new HttpCronJobService(baseUrl),
    dashboard: new HttpDashboardService(baseUrl),
    globalDashboard: new HttpGlobalDashboardService(baseUrl),
    permissionsConfig: new HttpPermissionsConfigService(baseUrl),
    speech: new HttpSpeechService(baseUrl),
  }
}

export { HttpProjectService, HttpAgentService, HttpConversationService, HttpTaskService, HttpWorkspaceService, HttpKnowledgeBaseService, HttpSkillService, HttpMCPService, HttpSettingsService, HttpCronJobService, HttpDashboardService, HttpGlobalDashboardService, HttpPermissionsConfigService } from './services'
export { HttpSpeechService } from './speech'
export { setAuthToken, getAuthToken, setBaseUrl, getBaseUrl } from './base'
