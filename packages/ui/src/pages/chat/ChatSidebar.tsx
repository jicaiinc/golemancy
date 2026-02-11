import { useCallback, useMemo } from 'react'
import type { Agent, AgentId, Conversation, ConversationId } from '@solocraft/shared'
import { PixelButton, PixelDropdown } from '../../components'

interface ChatSidebarProps {
  agents: Agent[]
  conversations: Conversation[]
  selectedAgentId: AgentId | null
  selectedConversationId: ConversationId | null
  onSelectAgent: (agentId: AgentId | null) => void
  onSelectConversation: (id: ConversationId) => void
  onNewChat: () => void
  canNewChat?: boolean
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function ChatSidebar({
  agents,
  conversations,
  selectedAgentId,
  selectedConversationId,
  onSelectAgent,
  onSelectConversation,
  onNewChat,
  canNewChat = false,
}: ChatSidebarProps) {
  const selectedAgent = agents.find(a => a.id === selectedAgentId)

  // Filter conversations by selected agent
  const filtered = selectedAgentId
    ? conversations.filter(c => c.agentId === selectedAgentId)
    : conversations

  // Sort by lastMessageAt descending
  const sorted = useMemo(
    () => [...filtered].sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    ),
    [filtered],
  )

  const agentDropdownItems = useMemo(
    () => [
      { label: 'All Agents', value: '__all__', selected: !selectedAgentId },
      ...agents.map(a => ({
        label: a.name,
        value: a.id,
        selected: a.id === selectedAgentId,
      })),
    ],
    [agents, selectedAgentId],
  )

  const handleAgentSelect = useCallback((value: string) => {
    onSelectAgent(value === '__all__' ? null : value as AgentId)
  }, [onSelectAgent])

  return (
    <div className="w-[240px] shrink-0 flex flex-col h-full border-r-2 border-border-dim bg-deep">
      {/* Agent filter */}
      <div className="p-3 border-b-2 border-border-dim">
        <label className="font-pixel text-[8px] text-text-dim mb-1 block">FILTER BY AGENT</label>
        <PixelDropdown
          trigger={
            <button className="w-full flex items-center justify-between px-3 py-2 bg-surface border-2 border-border-dim text-left cursor-pointer hover:border-border-bright transition-colors">
              <span className="text-[12px] font-mono text-text-primary truncate">
                {selectedAgent ? selectedAgent.name : 'All Agents'}
              </span>
              <span className="text-[10px] text-text-dim ml-2">&#9660;</span>
            </button>
          }
          items={agentDropdownItems}
          onSelect={handleAgentSelect}
          dividerAfter={[0]}
        />
      </div>

      {/* New chat button */}
      <div className="p-3 border-b-2 border-border-dim">
        <PixelButton
          variant="primary"
          className="w-full"
          onClick={onNewChat}
          disabled={!canNewChat}
        >
          + New Chat
        </PixelButton>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-[11px] text-text-dim font-mono">No conversations</p>
          </div>
        ) : (
          sorted.map(conv => {
            const isActive = conv.id === selectedConversationId
            const agent = agents.find(a => a.id === conv.agentId)
            return (
              <button
                key={conv.id}
                className={`w-full text-left px-3 py-3 border-b border-border-dim/50 cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-elevated border-l-2 border-l-accent-green'
                    : 'hover:bg-elevated/50 border-l-2 border-l-transparent'
                }`}
                onClick={() => onSelectConversation(conv.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-text-primary truncate flex-1">
                    {conv.title}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-accent-blue font-mono">
                    {agent?.name ?? '???'}
                  </span>
                  <span className="text-[10px] text-text-dim">
                    {relativeTime(conv.lastMessageAt)}
                  </span>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
