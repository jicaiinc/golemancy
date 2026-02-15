import type {
  IProjectService,
  IAgentService,
  IConversationService,
  ITaskService,
  IArtifactService,
  IMemoryService,
  ISkillService,
  IMCPService,
  ISettingsService,
  ICronJobService,
  IDashboardService,
  IPermissionsConfigService,
} from './interfaces'

export interface ServiceContainer {
  projects: IProjectService
  agents: IAgentService
  conversations: IConversationService
  tasks: ITaskService
  artifacts: IArtifactService
  memory: IMemoryService
  skills: ISkillService
  mcp: IMCPService
  settings: ISettingsService
  cronJobs: ICronJobService
  dashboard: IDashboardService
  permissionsConfig: IPermissionsConfigService
}

let services: ServiceContainer | null = null

export function getServices(): ServiceContainer {
  if (!services) throw new Error('Services not configured. Call configureServices() first.')
  return services
}

export function configureServices(container: ServiceContainer): void {
  services = container
}
