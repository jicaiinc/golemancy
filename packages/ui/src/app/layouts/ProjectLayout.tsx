import { useEffect } from 'react'
import { Outlet, useParams, useNavigate } from 'react-router'
import type { AgentId, AgentStatus, ProjectId } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { useWs } from '../../providers/WebSocketProvider'
import { AppShell } from '../../components/layout'

export function ProjectLayout() {
  const { projectId } = useParams<{ projectId: string }>()
  const selectProject = useAppStore(s => s.selectProject)
  const currentProjectId = useAppStore(s => s.currentProjectId)
  const projects = useAppStore(s => s.projects)
  const projectsLoading = useAppStore(s => s.projectsLoading)
  const navigate = useNavigate()
  const { subscribe, unsubscribe, addListener } = useWs()

  // Subscribe to project-specific WS channel
  useEffect(() => {
    if (!projectId) return
    subscribe([`project:${projectId}`])

    const removeListener = addListener('agent:status_changed', (data) => {
      useAppStore.getState().updateAgentStatus(
        data.agentId as AgentId,
        data.status as AgentStatus,
      )
    })

    return () => {
      unsubscribe([`project:${projectId}`])
      removeListener()
    }
  }, [projectId, subscribe, unsubscribe, addListener])

  useEffect(() => {
    if (!projectId) return

    const exists = projects.find(p => p.id === projectId)
    if (!projectsLoading && !exists) {
      navigate('/', { replace: true })
      return
    }

    if (!projectsLoading && exists && currentProjectId !== projectId) {
      selectProject(projectId as ProjectId)
    }
  }, [projectId, projects, projectsLoading, currentProjectId, selectProject, navigate])

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
