import type {
  IProjectService,
  IAgentService,
  IConversationService,
  ITaskService,
  IArtifactService,
  IMemoryService,
  ISkillService,
  ISettingsService,
  ICronJobService,
  IDashboardService,
} from './interfaces'

export interface ServiceContainer {
  projects: IProjectService
  agents: IAgentService
  conversations: IConversationService
  tasks: ITaskService
  artifacts: IArtifactService
  memory: IMemoryService
  skills: ISkillService
  settings: ISettingsService
  cronJobs: ICronJobService
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
