import { HashRouter, Routes, Route } from 'react-router'
import { ProjectLayout } from './layouts/ProjectLayout'
import { useAppStore } from '../stores'
import {
  ProjectListPage,
  DashboardPage,
  GlobalDashboardPage,
  AgentListPage,
  AgentDetailPage,
  SkillsPage,
  MCPServersPage,
  ChatPage,
  TaskListPage,
  CronJobsPage,
  WorkspacePage,
  KnowledgeBasePage,
  ProjectSettingsPage,
  GlobalSettingsPage,
  OnboardingPage,
} from '../pages'

function RootRedirect() {
  const settings = useAppStore(s => s.settings)
  const projects = useAppStore(s => s.projects)
  const projectsLoading = useAppStore(s => s.projectsLoading)

  // Wait for settings and projects to load before deciding
  if (!settings || projectsLoading) return null

  // Show onboarding if not completed AND (in-progress OR fresh install)
  const needsOnboarding = !settings.onboardingCompleted
    && (settings.onboardingStep != null
      || (Object.keys(settings.providers ?? {}).length === 0
        && projects.length === 0))

  if (needsOnboarding) {
    return <OnboardingPage />
  }

  return <ProjectListPage />
}

export function AppRoutes() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/dashboard" element={<GlobalDashboardPage />} />
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
          <Route path="artifacts" element={<WorkspacePage />} />
          <Route path="knowledge-base" element={<KnowledgeBasePage />} />
          <Route path="settings" element={<ProjectSettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
