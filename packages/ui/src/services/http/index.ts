import type { ServiceContainer } from '../container'
import {
  HttpProjectService,
  HttpAgentService,
  HttpConversationService,
  HttpTaskService,
  HttpArtifactService,
  HttpMemoryService,
  HttpSettingsService,
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
    settings: new HttpSettingsService(baseUrl),
    dashboard: new HttpDashboardService(baseUrl),
  }
}

export { HttpProjectService, HttpAgentService, HttpConversationService, HttpTaskService, HttpArtifactService, HttpMemoryService, HttpSettingsService, HttpDashboardService } from './services'
