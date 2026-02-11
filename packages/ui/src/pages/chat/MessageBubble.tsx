import { memo } from 'react'
import type { Message } from '@solocraft/shared'
import { ToolCallDisplay } from './ToolCallDisplay'

interface MessageBubbleProps {
  message: Message
  /** Show a blinking pixel cursor after the text (used during streaming) */
  showCursor?: boolean
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export const MessageBubble = memo(function MessageBubble({ message, showCursor }: MessageBubbleProps) {
  // System message — centered
  if (message.role === 'system') {
    return (
      <div className="flex justify-center my-2">
        <div className="px-4 py-2 max-w-[80%]">
          <p className="text-[12px] font-mono text-text-dim italic text-center">
            {message.content}
          </p>
          <p className="text-[10px] text-text-dim text-center mt-1">
            {formatTime(message.createdAt)}
          </p>
        </div>
      </div>
    )
  }

  // Tool messages are rendered inline via assistant's toolCalls
  if (message.role === 'tool') {
    return null
  }

  const isUser = message.role === 'user'

  return (
    <div data-testid="chat-message" data-role={message.role} className={`flex ${isUser ? 'justify-end' : 'justify-start'} my-2`}>
      <div className={`max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Message bubble */}
        <div
          className={`px-3 py-2 border-2 ${
            isUser
              ? 'bg-accent-blue/15 border-accent-blue/30'
              : 'bg-surface border-border-dim'
          }`}
        >
          <p className="text-[13px] font-mono text-text-primary whitespace-pre-wrap break-words">
            {message.content}
            {showCursor && (
              <span className="inline-block w-[8px] h-[14px] bg-accent-green ml-[2px] align-middle animate-[pixel-blink_1s_steps(2)_infinite]" />
            )}
          </p>
        </div>

        {/* Tool calls (assistant only) */}
        {message.role === 'assistant' && message.toolCalls?.map((tc, i) => (
          <ToolCallDisplay key={i} toolCall={tc} />
        ))}

        {/* Timestamp */}
        <p className={`text-[10px] text-text-dim mt-1 ${isUser ? 'text-right' : 'text-left'}`}>
          {formatTime(message.createdAt)}
        </p>
      </div>
    </div>
  )
})
