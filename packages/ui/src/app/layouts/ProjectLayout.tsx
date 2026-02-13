import { useEffect } from 'react'
import { Outlet, useParams, useNavigate } from 'react-router'
import type { ProjectId } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { AppShell } from '../../components/layout'

export function ProjectLayout() {
  const { projectId } = useParams<{ projectId: string }>()
  const selectProject = useAppStore(s => s.selectProject)
  const currentProjectId = useAppStore(s => s.currentProjectId)
  const projects = useAppStore(s => s.projects)
  const agents = useAppStore(s => s.agents)
  const navigate = useNavigate()

  useEffect(() => {
    if (!projectId) return

    const exists = projects.find(p => p.id === projectId)
    if (!exists) {
      navigate('/', { replace: true })
      return
    }

    if (currentProjectId !== projectId) {
      selectProject(projectId as ProjectId)
    }
  }, [projectId, projects, currentProjectId, selectProject, navigate])

  const activeAgents = agents.filter(a => a.status === 'running').length

  return (
    <AppShell activeAgents={activeAgents}>
      <Outlet />
    </AppShell>
  )
}
