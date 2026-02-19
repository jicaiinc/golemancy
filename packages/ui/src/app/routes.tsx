import { HashRouter, Routes, Route, Navigate } from 'react-router'
import { ProjectLayout } from './layouts/ProjectLayout'
import {
  ProjectListPage,
  DashboardPage,
  AgentListPage,
  AgentDetailPage,
  SkillsPage,
  MCPServersPage,
  ChatPage,
  TaskListPage,
  CronJobsPage,
  WorkspacePage,
  MemoryPage,
  ProjectSettingsPage,
  GlobalSettingsPage,
} from '../pages'

/** If window was opened with --project-id, redirect to that project */
function RootRedirect() {
  const projectId = window.electronAPI?.getInitialProjectId()
  if (projectId) {
    return <Navigate to={`/projects/${projectId}`} replace />
  }
  return <ProjectListPage />
}

export function AppRoutes() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/settings" element={<GlobalSettingsPage />} />
        <Route path="/projects/:projectId" element={<ProjectLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="agents" element={<AgentListPage />} />
          <Route path="agents/:agentId" element={<AgentDetailPage />} />
          <Route path="skills" element={<SkillsPage />} />
          <Route path="mcp-servers" element={<MCPServersPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="tasks" element={<TaskListPage />} />
          <Route path="cron" element={<CronJobsPage />} />
          <Route path="workspace" element={<WorkspacePage />} />
          <Route path="memory" element={<MemoryPage />} />
          <Route path="settings" element={<ProjectSettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
