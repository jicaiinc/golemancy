import type {
  IProjectService,
  IAgentService,
  IConversationService,
  ITaskService,
  IArtifactService,
  IMemoryService,
  ISettingsService,
  IDashboardService,
} from './interfaces'

export interface ServiceContainer {
  projects: IProjectService
  agents: IAgentService
  conversations: IConversationService
  tasks: ITaskService
  artifacts: IArtifactService
  memory: IMemoryService
  settings: ISettingsService
  dashboard: IDashboardService
}

let services: ServiceContainer | null = null

export function getServices(): ServiceContainer {
  if (!services) throw new Error('Services not configured. Call configureServices() first.')
  return services
}

export function configureServices(container: ServiceContainer): void {
  services = container
}
