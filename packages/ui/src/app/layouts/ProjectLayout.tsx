import { useEffect } from 'react'
import { Outlet, useParams, useNavigate } from 'react-router'
import type { Agent, AgentId, AgentStatus, ConversationId, ProjectId } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { useWs } from '../../providers/WebSocketProvider'
import { getServices } from '../../services/container'
import { queryClient } from '../../queries/query-client'
import { queryKeys } from '../../queries/keys'
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

    const removeStatusListener = addListener('agent:status_changed', (data) => {
      const pid = useAppStore.getState().currentProjectId
      if (!pid) return
      queryClient.setQueryData<Agent[]>(
        queryKeys.agents.all(pid),
        (old) => old?.map(a =>
          a.id === data.agentId ? { ...a, status: data.status as AgentStatus } : a,
        ),
      )
    })

    // When a cron job finishes, ensure its conversation appears in the sidebar
    const removeCronListener = addListener('runtime:cron_ended', (data) => {
      if (data.conversationId) {
        useAppStore.getState().ensureConversation(data.conversationId as ConversationId)
      }
    })

    // When a chat ends, silently refresh conversations to pick up sub-agent sessions
    const removeChatEndListener = addListener('runtime:chat_ended', async () => {
      const pid = useAppStore.getState().currentProjectId
      if (!pid) return
      const conversationList = await getServices().conversations.list(pid)
      if (useAppStore.getState().currentProjectId === pid) {
        useAppStore.setState({ conversationList })
      }
    })

    return () => {
      unsubscribe([`project:${projectId}`])
      removeStatusListener()
      removeCronListener()
      removeChatEndListener()
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
