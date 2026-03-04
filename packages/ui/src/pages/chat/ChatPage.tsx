import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { AgentId, ConversationId, ConversationTokenUsageResult, TeamId } from '@golemancy/shared'
import { DEFAULT_COMPACT_THRESHOLD } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { useCurrentProject, usePermissionMode } from '../../hooks'
import { getServices } from '../../services/container'
import { PixelSpinner, StatusBar } from '../../components'
import { ChatSidebar } from './ChatSidebar'
import { ChatWindow } from './ChatWindow'
import { ChatEmptyState } from './ChatEmptyState'

export function ChatPage() {
  const agents = useAppStore(s => s.agents)
  const conversations = useAppStore(s => s.conversations)
  const conversationsLoading = useAppStore(s => s.conversationsLoading)
  const currentConversationId = useAppStore(s => s.currentConversationId)
  const selectConversation = useAppStore(s => s.selectConversation)
  const createConversation = useAppStore(s => s.createConversation)
  const updateConversationTitle = useAppStore(s => s.updateConversationTitle)
  const conversationTasks = useAppStore(s => s.conversationTasks)
  const chatHistoryExpanded = useAppStore(s => s.chatHistoryExpanded)
  const toggleChatHistory = useAppStore(s => s.toggleChatHistory)
  const currentProject = useCurrentProject()
  const permissionMode = usePermissionMode()

  // Token usage tracking for current conversation
  const [conversationUsage, setConversationUsage] = useState<{ inputTokens: number; outputTokens: number } | null>(null)
  const [tokenBreakdown, setTokenBreakdown] = useState<ConversationTokenUsageResult | null>(null)

  // Context window tracking
  const [contextTokens, setContextTokens] = useState<number | null>(null)
  const [compacting, setCompacting] = useState(false)
  const [compactSource, setCompactSource] = useState<'auto' | 'manual' | null>(null)
  const [chatBusy, setChatBusy] = useState(false)
  const compactAbortRef = useRef<AbortController | null>(null)

  // Restore contextTokens from last assistant message when conversation changes
  useEffect(() => {
    if (!currentConversationId) {
      setContextTokens(null)
      return
    }
    const conv = conversations.find(c => c.id === currentConversationId)
    if (conv?.messages) {
      const lastAssistant = [...conv.messages].reverse().find(m => m.role === 'assistant')
      setContextTokens(lastAssistant?.contextTokens ?? null)
    } else {
      setContextTokens(null)
    }
  }, [currentConversationId, conversations])

  // Load historical usage when conversation changes
  useEffect(() => {
    if (!currentConversationId || !currentProject?.id) {
      setConversationUsage(null)
      setTokenBreakdown(null)
      return
    }
    const svc = getServices()
    if (svc.conversations.getConversationTokenUsage) {
      svc.conversations.getConversationTokenUsage(currentProject.id, currentConversationId)
        .then(result => {
          setConversationUsage(result.total)
          setTokenBreakdown(result)
        })
        .catch(() => {
          setConversationUsage(null)
          setTokenBreakdown(null)
        })
    } else {
      setConversationUsage(null)
      setTokenBreakdown(null)
    }
  }, [currentConversationId, currentProject?.id])

  const handleUsageUpdate = useCallback((usage: { inputTokens: number; outputTokens: number }) => {
    setConversationUsage(prev => prev
      ? { inputTokens: prev.inputTokens + usage.inputTokens, outputTokens: prev.outputTokens + usage.outputTokens }
      : usage
    )
  }, [])

  const handleContextUpdate = useCallback((tokens: number) => {
    setContextTokens(tokens)
  }, [])

  const handleBusyChange = useCallback((busy: boolean) => {
    setChatBusy(busy)
  }, [])

  const handleCompactingChange = useCallback((isCompacting: boolean) => {
    setCompacting(isCompacting)
    setCompactSource(isCompacting ? 'auto' : null)
  }, [])

  const handleCompactNow = useCallback(async () => {
    if (!currentConversationId || !currentProject?.id || compacting) return
    const abort = new AbortController()
    compactAbortRef.current = abort
    setCompacting(true)
    setCompactSource('manual')
    try {
      const svc = getServices()
      await svc.conversations.compact?.(currentProject.id, currentConversationId, abort.signal)
      // Reload conversation to get updated compactRecords and messages
      const updated = await svc.conversations.getById(currentProject.id, currentConversationId)
      if (updated) {
        useAppStore.setState(s => ({
          conversations: s.conversations.map(c => c.id === currentConversationId ? updated : c),
        }))
        // Update contextTokens from refreshed messages
        const lastAssistant = [...updated.messages].reverse().find(m => m.role === 'assistant')
        setContextTokens(lastAssistant?.contextTokens ?? null)
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Manual compact failed:', err)
      }
    } finally {
      compactAbortRef.current = null
      setCompacting(false)
      setCompactSource(null)
    }
  }, [currentConversationId, currentProject?.id, compacting])

  const handleCancelCompact = useCallback(() => {
    compactAbortRef.current?.abort()
  }, [])

  const [searchParams, setSearchParams] = useSearchParams()

  // Sync URL params -> store on mount
  useEffect(() => {
    const convParam = searchParams.get('conv') as ConversationId | null
    if (convParam && convParam !== currentConversationId) {
      selectConversation(convParam)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync store -> URL when conversation changes
  useEffect(() => {
    const params: Record<string, string> = {}
    if (currentConversationId) params.conv = currentConversationId
    setSearchParams(params, { replace: true })
  }, [currentConversationId, setSearchParams])

  const handleSelectConversation = useCallback((id: ConversationId) => {
    selectConversation(id)
  }, [selectConversation])

  const teams = useAppStore(s => s.teams)
  const defaultAgentId = currentProject?.defaultAgentId ?? null
  const defaultTeamId = currentProject?.defaultTeamId ?? null
  const canNewChat = !!defaultAgentId || !!defaultTeamId

  const handleRenameConversation = useCallback((id: ConversationId, title: string) => {
    updateConversationTitle(id, title)
  }, [updateConversationTitle])

  const handleNewChat = useCallback(async () => {
    // Prefer defaultTeamId: find leader agent and create conversation with teamId
    if (defaultTeamId) {
      const team = teams.find(t => t.id === defaultTeamId)
      const leader = team?.members.find(m => !m.parentAgentId)
      const agentId = leader?.agentId ?? defaultAgentId
      if (agentId) {
        await createConversation(agentId, 'New Chat', defaultTeamId)
        return
      }
    }
    if (!defaultAgentId) return
    await createConversation(defaultAgentId, 'New Chat')
  }, [defaultAgentId, defaultTeamId, teams, createConversation])

  const handleSwitchAgent = useCallback(async (agentId: AgentId, teamId?: TeamId) => {
    if (!currentProject) return
    // Create new conversation with the selected agent — don't change global defaultAgentId
    await createConversation(agentId, 'New Chat', teamId)
  }, [currentProject, createConversation])

  // Find current conversation and its agent
  const currentConversation = conversations.find(c => c.id === currentConversationId)
  const currentAgent = currentConversation
    ? agents.find(a => a.id === currentConversation.agentId)
    : undefined

  const compactThreshold = currentAgent?.compactThreshold ?? DEFAULT_COMPACT_THRESHOLD

  const isUnrestricted = permissionMode === 'unrestricted'

  // Task summary for current conversation
  const currentConvTasks = useMemo(
    () => currentConversationId
      ? conversationTasks.filter(t => t.conversationId === currentConversationId)
      : [],
    [conversationTasks, currentConversationId]
  )
  const taskSummary = currentConvTasks.length > 0
    ? {
        completed: currentConvTasks.filter(t => t.status === 'completed').length,
        total: currentConvTasks.filter(t => t.status !== 'deleted').length,
      }
    : null

  if (conversationsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <PixelSpinner />
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {chatHistoryExpanded && (
        <ChatSidebar
          agents={agents}
          teams={teams}
          conversations={conversations}
          selectedConversationId={currentConversationId}
          onSelectConversation={handleSelectConversation}
          onRenameConversation={handleRenameConversation}
          onNewChat={handleNewChat}
          canNewChat={canNewChat}
        />
      )}

      {/* Right side: chat panel + status bar */}
      <div className={`flex-1 flex flex-col min-w-0 min-h-0 ${
        isUnrestricted ? 'border-unrestricted' : ''
      }`}>
        {currentConversation ? (
          <ChatWindow
            key={currentConversation.id}
            conversation={currentConversation}
            agent={currentAgent}
            agents={agents}
            teams={teams}
            chatHistoryExpanded={chatHistoryExpanded}
            onToggleChatHistory={toggleChatHistory}
            onNewChat={handleNewChat}
            canNewChat={canNewChat}
            onSwitchAgent={handleSwitchAgent}
            onUsageUpdate={handleUsageUpdate}
            onContextUpdate={handleContextUpdate}
            onCompactingChange={handleCompactingChange}
            onBusyChange={handleBusyChange}
            externalCompacting={compacting}
          />
        ) : (
          <ChatEmptyState
            defaultAgentId={currentProject?.defaultAgentId}
            onNewChat={handleNewChat}
            canNewChat={canNewChat}
            chatHistoryExpanded={chatHistoryExpanded}
            onToggleChatHistory={toggleChatHistory}
          />
        )}
        {/* TODO: Pass actualMode from WS mode_degraded events once WebSocket integration is wired up */}
        <StatusBar permissionMode={permissionMode} tokenUsage={conversationUsage} tokenBreakdown={tokenBreakdown} taskSummary={taskSummary} taskList={currentConvTasks} contextTokens={contextTokens} compactThreshold={compactThreshold} onCompactNow={handleCompactNow} compacting={compacting} compactSource={compactSource} onCancelCompact={handleCancelCompact} chatBusy={chatBusy} />
      </div>
    </div>
  )
}
