import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import type { Agent, Conversation, ConversationId } from '@solocraft/shared'
import { PixelButton } from '../../components'

interface ChatSidebarProps {
  agents: Agent[]
  conversations: Conversation[]
  selectedConversationId: ConversationId | null
  onSelectConversation: (id: ConversationId) => void
  onRenameConversation?: (id: ConversationId, title: string) => void
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
  selectedConversationId,
  onSelectConversation,
  onRenameConversation,
  onNewChat,
  canNewChat = false,
}: ChatSidebarProps) {
  const [editingId, setEditingId] = useState<ConversationId | null>(null)
  const [editValue, setEditValue] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingId) {
      editInputRef.current?.focus()
      editInputRef.current?.select()
    }
  }, [editingId])

  const handleStartEdit = useCallback((conv: Conversation) => {
    setEditingId(conv.id)
    setEditValue(conv.title)
  }, [])

  const handleSaveEdit = useCallback(() => {
    if (editingId && editValue.trim() && onRenameConversation) {
      onRenameConversation(editingId, editValue.trim())
    }
    setEditingId(null)
  }, [editingId, editValue, onRenameConversation])

  const handleCancelEdit = useCallback(() => {
    setEditingId(null)
  }, [])

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelEdit()
    }
  }, [handleSaveEdit, handleCancelEdit])

  // Sort by lastMessageAt descending
  const sorted = useMemo(
    () => [...conversations].sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    ),
    [conversations],
  )

  return (
    <div className="w-[240px] shrink-0 flex flex-col h-full border-r-2 border-border-dim bg-deep">
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
                  {editingId === conv.id ? (
                    <input
                      ref={editInputRef}
                      className="text-[12px] text-text-primary bg-surface border border-border-dim px-1 py-0 w-full outline-none"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={handleEditKeyDown}
                      onBlur={handleSaveEdit}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span
                      className="text-[12px] text-text-primary truncate flex-1"
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        handleStartEdit(conv)
                      }}
                    >
                      {conv.title}
                    </span>
                  )}
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
