import { useCallback, useEffect, useRef } from 'react'
import { HashRouter, Routes, Route, useLocation, useNavigate } from 'react-router'
import type { Location as RouterLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ProjectLayout } from './layouts/ProjectLayout'
import { useAppStore } from '../stores'
import { PixelSpinner, PixelButton } from '../components'
import { logBootstrapEvent } from '../lib/bootstrap-logging'
import { trackPageView } from '../lib/analytics'
import {
  ProjectListPage,
  DashboardPage,
  GlobalDashboardPage,
  AgentListPage,
  AgentDetailPage,
  TeamListPage,
  TeamDetailPage,
  SkillsPage,
  MCPServersPage,
  ChatPage,
  CronJobsPage,
  WorkspacePage,
  ProjectSettingsPage,
  GlobalSettingsPage,
  GlobalSettingsOverlay,
  OnboardingPage,
} from '../pages'

function BootstrapLoading() {
  return (
    <div className="flex items-center justify-center h-screen bg-void">
      <PixelSpinner size="lg" label="Loading..." />
    </div>
  )
}

function BootstrapError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation(['error', 'common'])
  return (
    <div className="flex items-center justify-center h-screen bg-void">
      <div className="text-center max-w-[400px] p-8">
        {/* Pixel unplugged cable */}
        <div className="font-mono text-accent-green text-[10px] leading-[10px] mb-6 select-none">
          <pre>{`
  ████████████████
██                ██
██    ██        ██  ██
██    ██        ██  ██
██                  ██
██      ████████    ██
██    ██        ██  ██
  ██                ██
    ████████████████
          `.trim()}</pre>
        </div>

        <h1 className="font-pixel text-[14px] text-accent-red mb-2">
          {t('error:bootstrap.title', 'Connection Failed')}
        </h1>
        <p className="text-[12px] text-text-secondary mb-4">
          {t('error:bootstrap.message', 'Unable to connect to the local server. Don\'t worry, your data is safe.')}
        </p>
        <PixelButton variant="primary" onClick={onRetry}>
          {t('common:button.retry', 'Retry')}
        </PixelButton>
      </div>
    </div>
  )
}

function RootRedirect() {
  const settings = useAppStore(s => s.settings)
  const settingsError = useAppStore(s => s.settingsError)
  const projects = useAppStore(s => s.projects)
  const projectsLoading = useAppStore(s => s.projectsLoading)
  const projectsError = useAppStore(s => s.projectsError)
  const loadSettings = useAppStore(s => s.loadSettings)
  const loadProjects = useAppStore(s => s.loadProjects)
  const hasLoggedBootstrapErrorRef = useRef(false)

  const handleRetry = useCallback(() => {
    logBootstrapEvent('retry.click', {
      settingsError,
      projectsError,
      hasSettings: !!settings,
      projectsLoading,
      projectCount: projects.length,
    }, 'warning')
    loadSettings()
    loadProjects()
  }, [loadSettings, loadProjects, projects.length, projectsError, projectsLoading, settings, settingsError])

  useEffect(() => {
    if (settingsError || projectsError) {
      if (!hasLoggedBootstrapErrorRef.current) {
        hasLoggedBootstrapErrorRef.current = true
        logBootstrapEvent('rootRedirect.error', {
          settingsError,
          projectsError,
          hasSettings: !!settings,
          projectsLoading,
          projectCount: projects.length,
        }, 'warning')
      }
    } else {
      hasLoggedBootstrapErrorRef.current = false
    }
  }, [projects.length, projectsError, projectsLoading, settings, settingsError])

  // Loading: settings not yet loaded and no error
  if (!settings && !settingsError) return <BootstrapLoading />

  // Error: settings or projects failed to load
  if (settingsError || projectsError || !settings) return <BootstrapError onRetry={handleRetry} />

  // Projects still loading
  if (projectsLoading) return <BootstrapLoading />

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

interface RouteLocationState {
  backgroundLocation?: RouterLocation
}

function renderAppRoutes() {
  return (
    <>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/dashboard" element={<GlobalDashboardPage />} />
      <Route path="/settings" element={<GlobalSettingsPage />} />
      <Route path="/projects/:projectId" element={<ProjectLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="agents" element={<AgentListPage />} />
        <Route path="agents/:agentId" element={<AgentDetailPage />} />
        <Route path="teams" element={<TeamListPage />} />
        <Route path="teams/:teamId" element={<TeamDetailPage />} />
        <Route path="skills" element={<SkillsPage />} />
        <Route path="mcp-servers" element={<MCPServersPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="cron" element={<CronJobsPage />} />
        <Route path="artifacts" element={<WorkspacePage />} />
        <Route path="settings" element={<ProjectSettingsPage />} />
      </Route>
    </>
  )
}

function RoutedApp() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as RouteLocationState | null
  const backgroundLocation = state?.backgroundLocation

  useEffect(() => {
    trackPageView(location.pathname)
  }, [location.pathname])

  // Cmd+, / Ctrl+, from Electron menu → open Settings overlay
  useEffect(() => {
    const cleanup = window.electronAPI?.onMenuOpenSettings?.(() => {
      const alreadyOpen = /^#\/settings(?:[?#]|$)/.test(window.location.hash)
      if (!alreadyOpen) {
        navigate('/settings', { state: { backgroundLocation: location } })
      }
    })
    return () => cleanup?.()
  })

  return (
    <>
      <Routes location={backgroundLocation ?? location}>
        {renderAppRoutes()}
      </Routes>

      {backgroundLocation && location.pathname === '/settings' && (
        <Routes>
          <Route path="/settings" element={<GlobalSettingsOverlay />} />
        </Routes>
      )}
    </>
  )
}

export function AppRoutes() {
  return (
    <HashRouter>
      <RoutedApp />
    </HashRouter>
  )
}
