import { useState, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router'
import type { AgentId, ConversationId } from '@solocraft/shared'
import { useAppStore } from '../../stores'
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

  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId | null>(
    (searchParams.get('agent') as AgentId) ?? null
  )

  // Sync URL params → store on mount
  useEffect(() => {
    const convParam = searchParams.get('conv') as ConversationId | null
    if (convParam && convParam !== currentConversationId) {
      selectConversation(convParam)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync store → URL when conversation changes
  useEffect(() => {
    const params: Record<string, string> = {}
    if (selectedAgentId) params.agent = selectedAgentId
    if (currentConversationId) params.conv = currentConversationId
    setSearchParams(params, { replace: true })
  }, [selectedAgentId, currentConversationId, setSearchParams])

  const handleSelectAgent = useCallback((agentId: AgentId | null) => {
    setSelectedAgentId(agentId)
    selectConversation(null)
  }, [selectConversation])

  const handleSelectConversation = useCallback((id: ConversationId) => {
    selectConversation(id)
    // Also set the agent filter to match this conversation's agent
    const conv = conversations.find(c => c.id === id)
    if (conv) {
      setSelectedAgentId(conv.agentId)
    }
  }, [selectConversation, conversations])

  const handleNewChat = useCallback(async () => {
    if (!selectedAgentId) return
    const agent = agents.find(a => a.id === selectedAgentId)
    const title = `Chat with ${agent?.name ?? 'Agent'}`
    await createConversation(selectedAgentId, title)
  }, [selectedAgentId, agents, createConversation])

  const handleStartChat = useCallback(async (agentId: AgentId) => {
    setSelectedAgentId(agentId)
    const agent = agents.find(a => a.id === agentId)
    const title = `Chat with ${agent?.name ?? 'Agent'}`
    await createConversation(agentId, title)
  }, [agents, createConversation])

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
      <ChatSidebar
        agents={agents}
        conversations={conversations}
        selectedAgentId={selectedAgentId}
        selectedConversationId={currentConversationId}
        onSelectAgent={handleSelectAgent}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
      />

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {currentConversation ? (
          <ChatWindow key={currentConversation.id} conversation={currentConversation} agent={currentAgent} />
        ) : (
          <ChatEmptyState agents={agents} onStartChat={handleStartChat} />
        )}
      </div>
    </div>
  )
}
