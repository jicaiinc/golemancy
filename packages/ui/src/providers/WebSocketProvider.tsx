import { createContext, useContext, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { useWebSocket, getWsUrl } from '../hooks/useWebSocket'

type WsStatus = 'connecting' | 'connected' | 'disconnected'

type WsEventListener = (data: Record<string, unknown>) => void

interface WsContextValue {
  status: WsStatus
  subscribe: (channels: string[]) => void
  unsubscribe: (channels: string[]) => void
  /** Register a listener for a specific event type. Returns cleanup function. */
  addListener: (eventType: string, callback: WsEventListener) => () => void
}

const noopFn = () => () => {}

const WsContext = createContext<WsContextValue>({
  status: 'disconnected',
  subscribe: () => {},
  unsubscribe: () => {},
  addListener: noopFn,
})

export function useWs(): WsContextValue {
  return useContext(WsContext)
}

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const listenersRef = useRef(new Map<string, Set<WsEventListener>>())

  const onMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data as string) as Record<string, unknown>
      const eventType = data.event as string | undefined
      if (!eventType) return

      const listeners = listenersRef.current.get(eventType)
      if (listeners) {
        for (const cb of listeners) {
          cb(data)
        }
      }
    } catch {
      // Ignore non-JSON messages (e.g. pong)
    }
  }, [])

  const url = getWsUrl()
  const { status, subscribe, unsubscribe } = useWebSocket({ url, onMessage })

  // Subscribe to global channel on connect
  const hasSubscribedGlobal = useRef(false)
  useEffect(() => {
    if (status === 'connected' && !hasSubscribedGlobal.current) {
      subscribe(['global'])
      hasSubscribedGlobal.current = true
    }
    if (status === 'disconnected') {
      hasSubscribedGlobal.current = false
    }
  }, [status, subscribe])

  const addListener = useCallback((eventType: string, callback: WsEventListener) => {
    const map = listenersRef.current
    if (!map.has(eventType)) {
      map.set(eventType, new Set())
    }
    map.get(eventType)!.add(callback)

    return () => {
      const set = map.get(eventType)
      if (set) {
        set.delete(callback)
        if (set.size === 0) map.delete(eventType)
      }
    }
  }, [])

  return (
    <WsContext.Provider value={{ status, subscribe, unsubscribe, addListener }}>
      {children}
    </WsContext.Provider>
  )
}
