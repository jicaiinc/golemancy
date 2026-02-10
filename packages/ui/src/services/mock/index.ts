import type { ServiceContainer } from '../container'
import {
  MockProjectService,
  MockAgentService,
  MockConversationService,
  MockTaskService,
  MockArtifactService,
  MockMemoryService,
  MockSettingsService,
} from './services'

export function createMockServices(): ServiceContainer {
  return {
    projects: new MockProjectService(),
    agents: new MockAgentService(),
    conversations: new MockConversationService(),
    tasks: new MockTaskService(),
    artifacts: new MockArtifactService(),
    memory: new MockMemoryService(),
    settings: new MockSettingsService(),
  }
}
