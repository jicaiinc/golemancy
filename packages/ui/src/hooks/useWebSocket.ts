import { useEffect, useRef, useCallback, useState } from 'react'

type WsStatus = 'connecting' | 'connected' | 'disconnected'

interface UseWebSocketOptions {
  url: string | null
  onMessage?: (event: MessageEvent) => void
  onOpen?: () => void
  onClose?: () => void
}

interface UseWebSocketReturn {
  status: WsStatus
  send: (data: string) => void
  subscribe: (channels: string[]) => void
  unsubscribe: (channels: string[]) => void
}

const MAX_RECONNECT_DELAY = 30_000
const PING_INTERVAL = 30_000

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const { url, onMessage, onOpen, onClose } = options
  const [status, setStatus] = useState<WsStatus>('disconnected')
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttempt = useRef<number>(0)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pingTimer = useRef<ReturnType<typeof setInterval>>(undefined)

  // Keep latest callbacks in refs to avoid reconnect on callback change
  const onMessageRef = useRef(onMessage)
  const onOpenRef = useRef(onOpen)
  const onCloseRef = useRef(onClose)
  onMessageRef.current = onMessage
  onOpenRef.current = onOpen
  onCloseRef.current = onClose

  const cleanup = useCallback(() => {
    clearTimeout(reconnectTimer.current)
    clearInterval(pingTimer.current)
    if (wsRef.current) {
      wsRef.current.onopen = null
      wsRef.current.onclose = null
      wsRef.current.onmessage = null
      wsRef.current.onerror = null
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  const send = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data)
    }
  }, [])

  const subscribe = useCallback((channels: string[]) => {
    send(JSON.stringify({ type: 'subscribe', channels }))
  }, [send])

  const unsubscribe = useCallback((channels: string[]) => {
    send(JSON.stringify({ type: 'unsubscribe', channels }))
  }, [send])

  useEffect(() => {
    if (!url) {
      setStatus('disconnected')
      return
    }

    function connect() {
      cleanup()
      setStatus('connecting')

      const ws = new WebSocket(url!)
      wsRef.current = ws

      ws.onopen = () => {
        reconnectAttempt.current = 0
        setStatus('connected')
        onOpenRef.current?.()

        // Start heartbeat
        pingTimer.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, PING_INTERVAL)
      }

      ws.onmessage = (event) => {
        onMessageRef.current?.(event)
      }

      ws.onerror = () => {
        // onclose will fire after onerror, handle reconnect there
      }

      ws.onclose = () => {
        clearInterval(pingTimer.current)
        setStatus('disconnected')
        onCloseRef.current?.()

        // Exponential backoff with jitter
        const base = Math.min(1000 * 2 ** reconnectAttempt.current, MAX_RECONNECT_DELAY)
        const jitter = Math.random() * base * 0.3
        const delay = base + jitter
        reconnectAttempt.current++
        reconnectTimer.current = setTimeout(connect, delay)
      }
    }

    connect()
    return cleanup
  }, [url, cleanup])

  return { status, send, subscribe, unsubscribe }
}

/**
 * Build the WebSocket URL from electronAPI, or return null in mock mode.
 */
export function getWsUrl(): string | null {
  const baseUrl = window.electronAPI?.getServerBaseUrl()
  const token = window.electronAPI?.getServerToken()
  if (!baseUrl || !token) return null

  const wsBase = baseUrl.replace(/^http/, 'ws')
  return `${wsBase}/ws?token=${encodeURIComponent(token)}`
}
