import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import { motion } from 'motion/react'
import type { Agent, AgentId, Conversation } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { getServices } from '../../services'
import { PixelButton, PixelSpinner, SidebarToggleIcon } from '../../components'
import { staggerContainer, staggerItem } from '../../lib/motion'
import { getOrCreateChat } from '../../lib/chat-instances'
import { MessageBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'

/** Truncate text to maxLen at word boundary for auto-title */
function generateAutoTitle(text: string, maxLen = 50): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxLen) return trimmed
  const truncated = trimmed.slice(0, maxLen)
  const lastSpace = truncated.lastIndexOf(' ')
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + '...'
}

/** Get Electron server config, or null when running without Electron */
function getServerConfig(): { baseUrl: string; token: string } | null {
  const baseUrl = window.electronAPI?.getServerBaseUrl()
  const token = window.electronAPI?.getServerToken()
  return baseUrl && token ? { baseUrl, token } : null
}

interface ChatWindowProps {
  conversation: Conversation
  agent: Agent | undefined
  agents: Agent[]
  chatHistoryExpanded: boolean
  onToggleChatHistory: () => void
  onNewChat: () => void
  canNewChat: boolean
  onSwitchAgent: (agentId: AgentId) => void
}

export function ChatWindow({ conversation, agent, agents, chatHistoryExpanded, onToggleChatHistory, onNewChat, canNewChat, onSwitchAgent }: ChatWindowProps) {
  const deleteConversation = useAppStore(s => s.deleteConversation)
  const selectConversation = useAppStore(s => s.selectConversation)
  const updateConversationTitle = useAppStore(s => s.updateConversationTitle)
  const currentProjectId = useAppStore(s => s.currentProjectId)

  // --- Inline title editing ---
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false)
  const [toolWarnings, setToolWarnings] = useState<string[]>([])
  const titleInputRef = useRef<HTMLInputElement>(null)

  const handleTitleClick = useCallback(() => {
    setTitleValue(conversation.title)
    setEditingTitle(true)
    setTimeout(() => titleInputRef.current?.select(), 0)
  }, [conversation.title])

  const handleTitleSave = useCallback(() => {
    setEditingTitle(false)
    const trimmed = titleValue.trim()
    if (trimmed && trimmed !== conversation.title) {
      updateConversationTitle(conversation.id, trimmed)
      setTitleManuallyEdited(true)
    }
  }, [titleValue, conversation.title, conversation.id, updateConversationTitle])

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleTitleSave()
    if (e.key === 'Escape') setEditingTitle(false)
  }, [handleTitleSave])

  // --- Delete confirmation ---
  const [confirmDelete, setConfirmDelete] = useState(false)

  const serverConfig = useMemo(getServerConfig, [])
  const useServer = !!serverConfig
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Get or create the Chat instance (survives unmount/remount)
  const chat = useMemo(() => {
    if (!currentProjectId) return null
    return getOrCreateChat({
      conversationId: conversation.id,
      projectId: currentProjectId,
      agentId: conversation.agentId,
      initialMessages: conversation.messages,
      serverConfig,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // Only re-create Chat when conversation identity changes.
  // Other deps (projectId, agentId, messages, serverConfig) are stable
  // for a given conversation, or handled by the Chat instance cache.
  }, [conversation.id])

  // SAFETY: chat is null only when currentProjectId is null,
  // but ChatWindow is only rendered inside ProjectLayout which guarantees a project is selected.
  const {
    messages,
    status,
    error,
    stop,
    sendMessage: chatSendMessage,
  } = useChat({ chat: chat! })

  // Capture transient MCP/tool loading warnings from server via onData.
  // onData is typed as private in AbstractChat but needs to be set externally.
  useEffect(() => {
    if (!chat) return
    setToolWarnings([]);
    (chat as any).onData = (part: { type: string; data?: { message?: string }; transient?: boolean }) => {
      if (part.type === 'data-warning' && part.transient && part.data?.message) {
        setToolWarnings(prev => [...prev, part.data!.message!])
      }
    }
    return () => { (chat as any).onData = undefined }
  }, [chat])

  // Track whether this component mounted with pre-existing messages (loaded from cache).
  // If so, skip the stagger entrance animation to avoid a multi-second delay.
  const [shouldAnimateStagger] = useState(() => messages.length === 0)

  // Auto-scroll to bottom — also triggers during streaming (content updates
  // within the last message don't change messages.length, so we need status).
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, status])

  // --- Send handler ---
  const handleSend = useCallback(async (content: string) => {
    if (!currentProjectId || !chat) return

    // Auto-title: if first message and user hasn't manually renamed
    const isFirstMessage = messages.length === 0
    if (isFirstMessage && !titleManuallyEdited) {
      const autoTitle = generateAutoTitle(content)
      updateConversationTitle(conversation.id, autoTitle)
    }

    if (useServer) {
      chatSendMessage({ text: content })
    } else {
      // Mock mode: call service, then sync back to Chat
      const svc = getServices()
      await svc.conversations.sendMessage(currentProjectId, conversation.id, content)
      const updated = await svc.conversations.getById(currentProjectId, conversation.id)
      if (updated) {
        chat.messages = updated.messages.map(m => ({
          id: m.id,
          role: m.role,
          parts: m.parts as UIMessage['parts'],
        }))
        // Update store for sidebar metadata
        useAppStore.setState(s => ({
          conversations: s.conversations.map(c => c.id === conversation.id ? updated : c),
        }))
      }
    }
  }, [useServer, chatSendMessage, currentProjectId, conversation.id, chat, messages.length, updateConversationTitle, titleManuallyEdited])

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setConfirmDelete(false)
    await deleteConversation(conversation.id)
    selectConversation(null)
  }, [confirmDelete, deleteConversation, selectConversation, conversation.id])

  // --- Derived display state ---
  const isBusy = status === 'submitted' || status === 'streaming'
  const lastMsg = messages[messages.length - 1]
  const hasVisibleContent = lastMsg?.role === 'assistant' &&
    lastMsg.parts.some(p => p.type === 'text' && (p as { text: string }).text.length > 0)
  const showThinking = isBusy && !hasVisibleContent

  return (
    <div data-testid="chat-window" className="flex-1 flex flex-col min-h-0">
      {/* Header — 3-section layout: left (toggle + new), center (title), right (actions) */}
      <div className="flex items-center px-4 py-3 border-b-2 border-border-dim bg-deep">
        {/* Left: toggle + new chat */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            className="text-text-secondary hover:text-text-primary transition-colors p-1"
            onClick={onToggleChatHistory}
            title={chatHistoryExpanded ? 'Hide chat history' : 'Show chat history'}
          >
            <SidebarToggleIcon className="w-[18px] h-[16px]" />
          </button>
          {!chatHistoryExpanded && (
            <PixelButton size="sm" variant="ghost" onClick={onNewChat} disabled={!canNewChat}>
              + New
            </PixelButton>
          )}
        </div>

        {/* Center: title (centered with flex-1, double-click to rename) */}
        <div className="flex-1 flex items-center justify-center gap-2 min-w-0 px-2">
          {editingTitle ? (
            <input
              ref={titleInputRef}
              className="font-pixel text-[10px] text-text-primary bg-deep border-2 border-accent-blue px-2 py-0.5 outline-none text-center w-full max-w-[300px]"
              value={titleValue}
              onChange={e => setTitleValue(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
            />
          ) : (
            <h2
              className="font-pixel text-[10px] text-text-primary truncate cursor-pointer hover:text-accent-blue transition-colors"
              onClick={handleTitleClick}
              title="Click to rename"
            >
              {conversation.title}
            </h2>
          )}
          {!editingTitle && (
            messages.length === 0 && agents.length > 1 ? (
              <select
                className="text-[11px] text-accent-blue font-mono bg-deep border-2 border-border-dim px-1 py-0.5 outline-none cursor-pointer shrink-0"
                value={conversation.agentId}
                onChange={e => onSwitchAgent(e.target.value as AgentId)}
              >
                {agents.map(a => (
                  <option key={a.id} value={a.id}>@{a.name}</option>
                ))}
              </select>
            ) : agent && (
              <span className="text-[11px] text-accent-blue font-mono shrink-0">
                @{agent.name}
              </span>
            )
          )}
        </div>

        {/* Right: actions */}
        <div className="shrink-0">
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <PixelButton size="sm" variant="danger" onClick={handleDelete}>
                Confirm
              </PixelButton>
              <PixelButton size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </PixelButton>
            </div>
          ) : (
            <PixelButton size="sm" variant="ghost" onClick={handleDelete}>
              Delete
            </PixelButton>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 border-b-2 border-accent-red/40 bg-accent-red/10">
          <p className="text-[12px] font-mono text-accent-red">
            Error: {error.message}
          </p>
        </div>
      )}

      {/* MCP / tool loading warnings */}
      {toolWarnings.length > 0 && (
        <div className="px-4 py-2 border-b-2 border-accent-amber/40 bg-accent-amber/10">
          {toolWarnings.map((warning, i) => (
            <p key={i} className="text-[11px] font-mono text-accent-amber">
              {warning}
            </p>
          ))}
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !isBusy ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[12px] text-text-dim font-mono">
              Start the conversation...
            </p>
          </div>
        ) : (
          <motion.div {...staggerContainer} initial={shouldAnimateStagger ? 'initial' : false} animate="animate">
            {messages.map((msg: UIMessage) => (
              <motion.div key={msg.id} {...staggerItem}>
                <MessageBubble message={msg} chatStatus={status} />
              </motion.div>
            ))}

            {/* Thinking indicator */}
            {showThinking && (
              <div className="flex items-start my-2">
                <div className="px-3 py-2 border-2 border-border-dim bg-surface">
                  <PixelSpinner size="sm" label="Thinking" />
                </div>
              </div>
            )}
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} onStop={stop} isStreaming={isBusy} disabled={isBusy} />
    </div>
  )
}
