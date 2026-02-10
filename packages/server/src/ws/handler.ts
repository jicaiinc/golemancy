import type { WSContext } from 'hono/ws'
import type { WsServerEvent, WsClientMessage } from './events'

interface WsClient {
  ws: WSContext
  channels: Set<string>
}

export class WebSocketManager {
  private clients = new Map<string, WsClient>()
  private nextId = 0

  addClient(ws: WSContext): string {
    const id = `ws-${++this.nextId}`
    this.clients.set(id, { ws, channels: new Set() })
    return id
  }

  removeClient(id: string) {
    this.clients.delete(id)
  }

  handleMessage(clientId: string, raw: string) {
    try {
      const msg = JSON.parse(raw) as WsClientMessage

      switch (msg.type) {
        case 'subscribe':
          if (msg.channels) {
            const client = this.clients.get(clientId)
            if (client) {
              for (const ch of msg.channels) client.channels.add(ch)
            }
          }
          break

        case 'unsubscribe':
          if (msg.channels) {
            const client = this.clients.get(clientId)
            if (client) {
              for (const ch of msg.channels) client.channels.delete(ch)
            }
          }
          break

        case 'ping':
          this.clients.get(clientId)?.ws.send(JSON.stringify({ event: 'pong' }))
          break
      }
    } catch {
      // Ignore malformed messages
    }
  }

  emit(channel: string, event: WsServerEvent) {
    const data = JSON.stringify(event)
    for (const client of this.clients.values()) {
      if (client.channels.has(channel)) {
        client.ws.send(data)
      }
    }
  }

  broadcast(event: WsServerEvent) {
    const data = JSON.stringify(event)
    for (const client of this.clients.values()) {
      client.ws.send(data)
    }
  }

  get clientCount() {
    return this.clients.size
  }
}
