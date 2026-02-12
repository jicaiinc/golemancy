import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import { motion } from 'motion/react'
import type { Agent, Conversation } from '@solocraft/shared'
import { useAppStore } from '../../stores'
import { getServices } from '../../services'
import { PixelButton, PixelSpinner } from '../../components'
import { staggerContainer, staggerItem } from '../../lib/motion'
import { getOrCreateChat } from '../../lib/chat-instances'
import { MessageBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'

/** Get Electron server config, or null when running without Electron */
function getServerConfig(): { baseUrl: string; token: string } | null {
  const baseUrl = window.electronAPI?.getServerBaseUrl()
  const token = window.electronAPI?.getServerToken()
  return baseUrl && token ? { baseUrl, token } : null
}

interface ChatWindowProps {
  conversation: Conversation
  agent: Agent | undefined
}

export function ChatWindow({ conversation, agent }: ChatWindowProps) {
  const deleteConversation = useAppStore(s => s.deleteConversation)
  const selectConversation = useAppStore(s => s.selectConversation)
  const currentProjectId = useAppStore(s => s.currentProjectId)

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
    sendMessage: chatSendMessage,
  } = useChat({ chat: chat! })

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
  }, [useServer, chatSendMessage, currentProjectId, conversation.id, chat])

  const handleDelete = useCallback(async () => {
    await deleteConversation(conversation.id)
    selectConversation(null)
  }, [deleteConversation, selectConversation, conversation.id])

  // --- Derived display state ---
  const isBusy = status === 'submitted' || status === 'streaming'
  const lastMsg = messages[messages.length - 1]
  const hasVisibleContent = lastMsg?.role === 'assistant' &&
    lastMsg.parts.some(p => p.type === 'text' && (p as { text: string }).text.length > 0)
  const showThinking = isBusy && !hasVisibleContent

  return (
    <div data-testid="chat-window" className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b-2 border-border-dim bg-deep">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="font-pixel text-[10px] text-text-primary truncate">
            {conversation.title}
          </h2>
          {agent && (
            <span className="text-[11px] text-accent-blue font-mono shrink-0">
              @{agent.name}
            </span>
          )}
        </div>
        <PixelButton size="sm" variant="ghost" onClick={handleDelete}>
          Delete
        </PixelButton>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 border-b-2 border-accent-red/40 bg-accent-red/10">
          <p className="text-[12px] font-mono text-accent-red">
            Error: {error.message}
          </p>
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
                <MessageBubble message={msg} />
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
      <ChatInput onSend={handleSend} disabled={isBusy} />
    </div>
  )
}
