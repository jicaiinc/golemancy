import { useState, useEffect, useRef } from 'react'

interface StreamingMessageProps {
  content: string
  onComplete: () => void
}

export function StreamingMessage({ content, onComplete }: StreamingMessageProps) {
  const [displayed, setDisplayed] = useState('')
  const indexRef = useRef(0)

  useEffect(() => {
    indexRef.current = 0
    setDisplayed('')

    const tick = () => {
      indexRef.current += 1
      const next = content.slice(0, indexRef.current)
      setDisplayed(next)
      if (indexRef.current >= content.length) {
        onComplete()
        return
      }
      // Random delay 20-50ms for natural feel
      timer = window.setTimeout(tick, 20 + Math.random() * 30)
    }

    let timer = window.setTimeout(tick, 60)
    return () => clearTimeout(timer)
  }, [content, onComplete])

  return (
    <div className="flex items-start my-2">
      <div className="max-w-[75%] px-3 py-2 border-2 border-border-dim bg-surface">
        <div className="text-[13px] font-mono text-text-primary whitespace-pre-wrap">
          {displayed}
          {/* Blinking pixel cursor */}
          <span className="inline-block w-[8px] h-[14px] bg-accent-green ml-[2px] align-middle animate-[pixel-blink_1s_steps(2)_infinite]" />
        </div>
      </div>
    </div>
  )
}
