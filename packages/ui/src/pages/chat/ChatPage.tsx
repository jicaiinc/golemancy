import { useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router'
import type { AgentId, ConversationId } from '@solocraft/shared'
import { useAppStore } from '../../stores'
import { useCurrentProject } from '../../hooks'
import { PixelSpinner } from '../../components'
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
  const chatHistoryExpanded = useAppStore(s => s.chatHistoryExpanded)
  const toggleChatHistory = useAppStore(s => s.toggleChatHistory)
  const currentProject = useCurrentProject()

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

  const mainAgentId = currentProject?.mainAgentId ?? null
  const canNewChat = !!mainAgentId

  const handleRenameConversation = useCallback((id: ConversationId, title: string) => {
    updateConversationTitle(id, title)
  }, [updateConversationTitle])

  const handleNewChat = useCallback(async () => {
    if (!mainAgentId) return
    await createConversation(mainAgentId, 'New Chat')
  }, [mainAgentId, createConversation])

  const deleteConversation = useAppStore(s => s.deleteConversation)
  const updateProject = useAppStore(s => s.updateProject)

  const handleSwitchAgent = useCallback(async (agentId: AgentId) => {
    if (!currentConversationId || !currentProject) return
    const oldConvId = currentConversationId
    // Create new conversation first so UI doesn't flash empty
    await createConversation(agentId, 'New Chat')
    await updateProject(currentProject.id, { mainAgentId: agentId })
    await deleteConversation(oldConvId)
  }, [currentConversationId, currentProject, createConversation, updateProject, deleteConversation])

  // Find current conversation and its agent
  const currentConversation = conversations.find(c => c.id === currentConversationId)
  const currentAgent = currentConversation
    ? agents.find(a => a.id === currentConversation.agentId)
    : undefined

  if (conversationsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <PixelSpinner />
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {chatHistoryExpanded && (
        <ChatSidebar
          agents={agents}
          conversations={conversations}
          selectedConversationId={currentConversationId}
          onSelectConversation={handleSelectConversation}
          onRenameConversation={handleRenameConversation}
          onNewChat={handleNewChat}
          canNewChat={canNewChat}
        />
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {currentConversation ? (
          <ChatWindow
            key={currentConversation.id}
            conversation={currentConversation}
            agent={currentAgent}
            agents={agents}
            chatHistoryExpanded={chatHistoryExpanded}
            onToggleChatHistory={toggleChatHistory}
            onNewChat={handleNewChat}
            canNewChat={canNewChat}
            onSwitchAgent={handleSwitchAgent}
          />
        ) : (
          <ChatEmptyState
            mainAgentId={currentProject?.mainAgentId}
            onNewChat={handleNewChat}
            canNewChat={canNewChat}
            chatHistoryExpanded={chatHistoryExpanded}
            onToggleChatHistory={toggleChatHistory}
          />
        )}
      </div>
    </div>
  )
}
