import { memo, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { UIMessage } from 'ai'
import { CopyIcon, CheckIcon } from '../../components'
import { ToolCallDisplay } from './ToolCallDisplay'

/** Blinking pixel cursor shown during streaming */
function BlinkingCursor() {
  return (
    <span className="inline-block w-[8px] h-[14px] bg-accent-green ml-[2px] align-middle animate-[pixel-blink_1s_steps(2)_infinite]" />
  )
}

/** Collapsible reasoning display */
function ReasoningDisplay({ text, state }: { text: string; state?: string }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="my-1 border-2 border-border-dim bg-deep/50">
      <button
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left cursor-pointer hover:bg-elevated/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[10px] text-text-dim font-mono select-none">
          {expanded ? '[-]' : '[+]'}
        </span>
        <span className="text-[11px] font-mono text-accent-purple">
          Reasoning
        </span>
        {state === 'streaming' && <BlinkingCursor />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2 border-t-2 border-border-dim">
              <p className="mt-1 text-[12px] font-mono text-text-secondary whitespace-pre-wrap break-words">
                {text}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** File attachment display */
function FileDisplay({ mediaType, filename, url }: { mediaType: string; filename?: string; url: string }) {
  const displayName = filename || 'Untitled file'
  const isImage = mediaType.startsWith('image/')

  if (isImage) {
    return (
      <div className="my-1">
        <img src={url} alt={displayName} className="max-w-full max-h-[300px] border-2 border-border-dim" />
        {filename && (
          <p className="text-[10px] font-mono text-text-dim mt-0.5">{filename}</p>
        )}
      </div>
    )
  }

  return (
    <div className="my-1 flex items-center gap-2 px-3 py-2 border-2 border-border-dim bg-deep">
      <span className="text-[11px] font-mono text-accent-blue">[FILE]</span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[12px] font-mono text-accent-blue underline truncate"
      >
        {displayName}
      </a>
      <span className="text-[10px] font-mono text-text-dim ml-auto">{mediaType}</span>
    </div>
  )
}

/** Source URL link */
function SourceLink({ url, title }: { url: string; title?: string }) {
  return (
    <div className="my-1 flex items-center gap-2">
      <span className="text-[10px] font-mono text-text-dim">[SRC]</span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] font-mono text-accent-blue underline truncate"
      >
        {title || url}
      </a>
    </div>
  )
}

/** Extract tool invocation data from a part that looks like a tool part.
 *  Handles both DynamicToolUIPart (type: 'dynamic-tool') and
 *  typed ToolUIPart (type: 'tool-${name}'). */
function extractToolInvocation(part: { type: string; [key: string]: unknown }) {
  // DynamicToolUIPart has toolName directly
  if (part.type === 'dynamic-tool' && typeof part.toolName === 'string') {
    return {
      toolName: part.toolName as string,
      toolCallId: (part.toolCallId as string) || '',
      state: (part.state as string) || 'input-available',
      input: part.input,
      output: part.output,
      errorText: part.errorText as string | undefined,
    }
  }
  // Typed ToolUIPart has type 'tool-${name}' and toolCallId
  if (part.type.startsWith('tool-') && 'toolCallId' in part) {
    return {
      toolName: part.type.slice(5), // remove 'tool-' prefix
      toolCallId: (part.toolCallId as string) || '',
      state: (part.state as string) || 'input-available',
      input: part.input,
      output: part.output,
      errorText: part.errorText as string | undefined,
    }
  }
  return null
}

/** Copy-to-clipboard button — floats to the side of the text bubble, never overlapping content */
function CopyButton({ text, position }: { text: string; position: 'left' | 'right' }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback for non-secure contexts
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className={`absolute top-1 ${position === 'left' ? '-left-8' : '-right-8'} p-1 opacity-0 group-hover/text:opacity-100 transition-opacity text-text-dim hover:text-text-primary`}
      title="Copy"
    >
      {copied
        ? <CheckIcon className="w-3.5 h-3.5 text-accent-green" />
        : <CopyIcon className="w-3.5 h-3.5" />
      }
    </button>
  )
}

interface MessageBubbleProps {
  message: UIMessage
  chatStatus?: string
}

export const MessageBubble = memo(function MessageBubble({ message, chatStatus }: MessageBubbleProps) {
  // System message — centered
  if (message.role === 'system') {
    const text = message.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map(p => p.text)
      .join('')
    return (
      <div className="flex justify-center my-2">
        <div className="px-4 py-2 max-w-[80%]">
          <p className="text-[12px] font-mono text-text-dim italic text-center">
            {text}
          </p>
        </div>
      </div>
    )
  }

  const isUser = message.role === 'user'

  return (
    <div data-testid="chat-message" data-role={message.role} className={`flex ${isUser ? 'justify-end' : 'justify-start'} my-2`}>
      <div className={`max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        {message.parts.map((part, i) => {
          switch (part.type) {
            case 'text':
              return (
                <div key={i} className="relative group/text">
                  <div
                    className={`px-3 py-2 border-2 ${
                      isUser
                        ? 'bg-accent-blue/15 border-accent-blue/30'
                        : 'bg-surface border-border-dim'
                    }`}
                  >
                    <p className="text-[13px] font-mono text-text-primary whitespace-pre-wrap break-words">
                      {part.text}
                      {part.state === 'streaming' && <BlinkingCursor />}
                    </p>
                  </div>
                  <CopyButton text={part.text} position={isUser ? 'left' : 'right'} />
                </div>
              )

            case 'reasoning':
              return <ReasoningDisplay key={i} text={part.text} state={part.state} />

            case 'file':
              return <FileDisplay key={i} mediaType={part.mediaType} filename={part.filename} url={part.url} />

            case 'source-url':
              return <SourceLink key={i} url={part.url} title={part.title} />

            case 'step-start':
              return <div key={i} className="my-2 border-t border-border-dim/50" />

            default: {
              // Handle tool parts: DynamicToolUIPart (type: 'dynamic-tool')
              // and typed ToolUIPart (type: 'tool-${name}').
              // Dynamic tool parts are not included in the UIMessagePart union.
              // We extract them by checking for 'toolInvocation' property,
              // requiring a type assertion to access the field.
              const tool = extractToolInvocation(part as { type: string; [key: string]: unknown })
              if (tool) {
                return <ToolCallDisplay key={i} toolInvocation={tool} chatStatus={chatStatus} />
              }
              // Unknown part type — gracefully ignore
              return null
            }
          }
        })}
      </div>
    </div>
  )
})
