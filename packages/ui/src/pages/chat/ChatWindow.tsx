import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { motion } from 'motion/react'
import type {
  Agent, Conversation, ConversationId, Message, MessageId,
} from '@solocraft/shared'
import { useAppStore } from '../../stores'
import { PixelButton, PixelSpinner } from '../../components'
import { staggerContainer, staggerItem } from '../../lib/motion'
import { MessageBubble } from './MessageBubble'
import { StreamingMessage } from './StreamingMessage'
import { ChatInput } from './ChatInput'

/** Get Electron server config, or null when running without Electron */
function getServerConfig(): { baseUrl: string; token: string } | null {
  const baseUrl = window.electronAPI?.getServerBaseUrl()
  const token = window.electronAPI?.getServerToken()
  return baseUrl && token ? { baseUrl, token } : null
}

/** Convert app Message[] → UIMessage[] for useChat initial messages */
function toUIMessages(messages: Message[]): UIMessage[] {
  return messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      parts: [{ type: 'text' as const, text: m.content }],
    }))
}

/** Convert a UIMessage back to our app Message type for rendering */
function toAppMessage(msg: UIMessage, conversationId: ConversationId): Message {
  let text = ''
  for (const part of msg.parts) {
    if (part.type === 'text') text += part.text
  }
  const ts = (msg as UIMessage & { createdAt?: string }).createdAt ?? ''
  return {
    id: msg.id as MessageId,
    conversationId,
    role: msg.role,
    content: text,
    createdAt: ts,
    updatedAt: ts,
  }
}

interface ChatWindowProps {
  conversation: Conversation
  agent: Agent | undefined
}

export function ChatWindow({ conversation, agent }: ChatWindowProps) {
  const storeSendMessage = useAppStore(s => s.sendMessage)
  const deleteConversation = useAppStore(s => s.deleteConversation)
  const selectConversation = useAppStore(s => s.selectConversation)
  const currentProjectId = useAppStore(s => s.currentProjectId)

  // Stable server config (won't change during component lifetime)
  const serverConfig = useMemo(getServerConfig, [])
  const useServer = !!serverConfig

  // --- AI SDK useChat (always called to satisfy rules of hooks) ---
  const initialMessages = useMemo(
    () => useServer ? toUIMessages(conversation.messages) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [useServer]
  )

  const transport = useMemo(() => {
    if (!serverConfig) return undefined
    return new DefaultChatTransport({
      api: `${serverConfig.baseUrl}/api/chat`,
      body: {
        projectId: currentProjectId,
        agentId: conversation.agentId,
        conversationId: conversation.id,
      },
      headers: { Authorization: `Bearer ${serverConfig.token}` },
    })
  }, [serverConfig, currentProjectId, conversation.agentId, conversation.id])

  const {
    messages: chatMessages,
    status: chatStatus,
    error: chatError,
    sendMessage: chatSendMessage,
  } = useChat({ transport, messages: initialMessages })

  // --- Mock mode state ---
  const [mockSending, setMockSending] = useState(false)
  const [streamingContent, setStreamingContent] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevMessageCount = useRef(conversation.messages.length)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages.length, conversation.messages.length])

  // Mock mode: detect new assistant message for typewriter effect
  useEffect(() => {
    if (useServer) return
    const msgs = conversation.messages
    if (msgs.length > prevMessageCount.current) {
      const lastMsg = msgs[msgs.length - 1]
      if (lastMsg.role === 'assistant') {
        setStreamingContent(lastMsg.content)
      }
    }
    prevMessageCount.current = msgs.length
  }, [useServer, conversation.messages])

  const handleStreamComplete = useCallback(() => {
    setStreamingContent(null)
  }, [])

  // --- Send handler ---
  const handleSend = useCallback(async (content: string) => {
    if (useServer) {
      chatSendMessage({ text: content })
    } else {
      setMockSending(true)
      try {
        await storeSendMessage(conversation.id, content)
      } finally {
        setMockSending(false)
      }
    }
  }, [useServer, chatSendMessage, storeSendMessage, conversation.id])

  const handleDelete = useCallback(async () => {
    await deleteConversation(conversation.id)
    selectConversation(null)
  }, [deleteConversation, selectConversation, conversation.id])

  // --- Derived display state ---
  const isBusy = useServer
    ? chatStatus === 'submitted' || chatStatus === 'streaming'
    : mockSending

  const displayMessages = useMemo<Message[]>(() => {
    if (useServer) {
      return chatMessages.map(m => toAppMessage(m, conversation.id))
    }
    return streamingContent
      ? conversation.messages.slice(0, -1)
      : conversation.messages
  }, [useServer, chatMessages, conversation.id, conversation.messages, streamingContent])

  const showThinking = useServer
    ? chatStatus === 'submitted'
    : mockSending && !streamingContent

  const isStreamingNow = useServer && chatStatus === 'streaming'

  return (
    <div className="flex flex-col h-full">
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
      {chatError && (
        <div className="px-4 py-2 border-b-2 border-accent-red/40 bg-accent-red/10">
          <p className="text-[12px] font-mono text-accent-red">
            Error: {chatError.message}
          </p>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {displayMessages.length === 0 && !isBusy ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[12px] text-text-dim font-mono">
              Start the conversation...
            </p>
          </div>
        ) : (
          <motion.div {...staggerContainer} initial="initial" animate="animate">
            {displayMessages.map((msg, i) => (
              <motion.div key={msg.id} {...staggerItem}>
                <MessageBubble
                  message={msg}
                  showCursor={
                    isStreamingNow
                    && i === displayMessages.length - 1
                    && msg.role === 'assistant'
                  }
                />
              </motion.div>
            ))}

            {/* Mock mode: typewriter streaming effect */}
            {!useServer && streamingContent && (
              <StreamingMessage
                content={streamingContent}
                onComplete={handleStreamComplete}
              />
            )}

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
