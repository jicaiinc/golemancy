import type {
  IProjectService,
  IAgentService,
  IConversationService,
  ITaskService,
  IWorkspaceService,
  IKnowledgeBaseService,
  ISkillService,
  IMCPService,
  ISettingsService,
  ICronJobService,
  IDashboardService,
  IGlobalDashboardService,
  IPermissionsConfigService,
  ISpeechService,
} from './interfaces'

export interface ServiceContainer {
  projects: IProjectService
  agents: IAgentService
  conversations: IConversationService
  tasks: ITaskService
  workspace: IWorkspaceService
  knowledgeBase: IKnowledgeBaseService
  skills: ISkillService
  mcp: IMCPService
  settings: ISettingsService
  cronJobs: ICronJobService
  dashboard: IDashboardService
  globalDashboard: IGlobalDashboardService
  permissionsConfig: IPermissionsConfigService
  speech: ISpeechService
}

let services: ServiceContainer | null = null

export function getServices(): ServiceContainer {
  if (!services) throw new Error('Services not configured. Call configureServices() first.')
  return services
}

export function configureServices(container: ServiceContainer): void {
  services = container
}
