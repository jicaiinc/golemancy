import { HashRouter, Routes, Route } from 'react-router'
import { ProjectLayout } from './layouts/ProjectLayout'
import {
  DashboardPage,
  ProjectListPage,
  ProjectDashboardPage,
  AgentListPage,
  AgentDetailPage,
  SkillsPage,
  MCPServersPage,
  ChatPage,
  TaskListPage,
  CronJobsPage,
  ArtifactsPage,
  MemoryPage,
  ProjectSettingsPage,
  GlobalSettingsPage,
} from '../pages'

export function AppRoutes() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<ProjectListPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/settings" element={<GlobalSettingsPage />} />
        <Route path="/projects/:projectId" element={<ProjectLayout />}>
          <Route index element={<ProjectDashboardPage />} />
          <Route path="agents" element={<AgentListPage />} />
          <Route path="agents/:agentId" element={<AgentDetailPage />} />
          <Route path="skills" element={<SkillsPage />} />
          <Route path="mcp-servers" element={<MCPServersPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="tasks" element={<TaskListPage />} />
          <Route path="cron" element={<CronJobsPage />} />
          <Route path="artifacts" element={<ArtifactsPage />} />
          <Route path="memory" element={<MemoryPage />} />
          <Route path="settings" element={<ProjectSettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
