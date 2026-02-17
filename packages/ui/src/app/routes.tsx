import { lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router'
import { ProjectLayout } from './layouts/ProjectLayout'

// Eagerly loaded: lightweight, always needed on first render
import { ProjectListPage } from '../pages/project'

// Lazy loaded: heavier pages with large dependencies or less frequently visited
const ProjectDashboardPage = lazy(() => import('../pages/project/ProjectDashboardPage').then(m => ({ default: m.ProjectDashboardPage })))
const AgentListPage = lazy(() => import('../pages/agent/AgentListPage').then(m => ({ default: m.AgentListPage })))
const AgentDetailPage = lazy(() => import('../pages/agent/AgentDetailPage').then(m => ({ default: m.AgentDetailPage })))
const SkillsPage = lazy(() => import('../pages/skill/SkillsPage').then(m => ({ default: m.SkillsPage })))
const MCPServersPage = lazy(() => import('../pages/mcp/MCPServersPage').then(m => ({ default: m.MCPServersPage })))
const ChatPage = lazy(() => import('../pages/chat/ChatPage').then(m => ({ default: m.ChatPage })))
const TaskListPage = lazy(() => import('../pages/task/TaskListPage').then(m => ({ default: m.TaskListPage })))
const CronJobsPage = lazy(() => import('../pages/cron/CronJobsPage').then(m => ({ default: m.CronJobsPage })))
const ArtifactsPage = lazy(() => import('../pages/artifact/ArtifactsPage').then(m => ({ default: m.ArtifactsPage })))
const MemoryPage = lazy(() => import('../pages/memory/MemoryPage').then(m => ({ default: m.MemoryPage })))
const ProjectSettingsPage = lazy(() => import('../pages/project/ProjectSettingsPage').then(m => ({ default: m.ProjectSettingsPage })))
const GlobalSettingsPage = lazy(() => import('../pages/settings/GlobalSettingsPage').then(m => ({ default: m.GlobalSettingsPage })))

function LazyFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <span className="font-pixel text-[10px] text-text-dim animate-pulse">Loading...</span>
    </div>
  )
}

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
      <Suspense fallback={<LazyFallback />}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
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
      </Suspense>
    </HashRouter>
  )
}
