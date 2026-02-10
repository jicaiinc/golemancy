import { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'motion/react'
import type { Agent, Conversation, ConversationId } from '@solocraft/shared'
import { useAppStore } from '../../stores'
import { PixelButton, PixelSpinner } from '../../components'
import { staggerContainer, staggerItem } from '../../lib/motion'
import { MessageBubble } from './MessageBubble'
import { StreamingMessage } from './StreamingMessage'
import { ChatInput } from './ChatInput'

interface ChatWindowProps {
  conversation: Conversation
  agent: Agent | undefined
}

export function ChatWindow({ conversation, agent }: ChatWindowProps) {
  const sendMessage = useAppStore(s => s.sendMessage)
  const deleteConversation = useAppStore(s => s.deleteConversation)
  const selectConversation = useAppStore(s => s.selectConversation)

  const [sending, setSending] = useState(false)
  const [streamingContent, setStreamingContent] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevMessageCount = useRef(conversation.messages.length)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation.messages.length, streamingContent])

  // Detect new assistant message for streaming effect
  useEffect(() => {
    const msgs = conversation.messages
    if (msgs.length > prevMessageCount.current) {
      const lastMsg = msgs[msgs.length - 1]
      if (lastMsg.role === 'assistant') {
        setStreamingContent(lastMsg.content)
      }
    }
    prevMessageCount.current = msgs.length
  }, [conversation.messages])

  const handleStreamComplete = useCallback(() => {
    setStreamingContent(null)
  }, [])

  const handleSend = useCallback(async (content: string) => {
    setSending(true)
    try {
      await sendMessage(conversation.id, content)
    } finally {
      setSending(false)
    }
  }, [sendMessage, conversation.id])

  const handleDelete = useCallback(async () => {
    await deleteConversation(conversation.id)
    selectConversation(null as unknown as ConversationId)
  }, [deleteConversation, selectConversation, conversation.id])

  // Messages to display — if streaming, hide the last assistant message
  const visibleMessages = streamingContent
    ? conversation.messages.slice(0, -1)
    : conversation.messages

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

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {conversation.messages.length === 0 && !sending ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[12px] text-text-dim font-mono">
              Start the conversation...
            </p>
          </div>
        ) : (
          <motion.div {...staggerContainer} initial="initial" animate="animate">
            {visibleMessages.map(msg => (
              <motion.div key={msg.id} {...staggerItem}>
                <MessageBubble message={msg} />
              </motion.div>
            ))}

            {/* Streaming effect for new assistant message */}
            {streamingContent && (
              <StreamingMessage
                content={streamingContent}
                onComplete={handleStreamComplete}
              />
            )}

            {/* Sending indicator */}
            {sending && !streamingContent && (
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
      <ChatInput onSend={handleSend} disabled={sending} />
    </div>
  )
}
