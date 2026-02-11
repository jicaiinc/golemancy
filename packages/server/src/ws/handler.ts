import type { WSContext } from 'hono/ws'
import type { WsServerEvent, WsClientMessage } from './events'
import { logger } from '../logger'

const log = logger.child({ component: 'ws' })

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
    log.debug({ clientId: id, totalClients: this.clients.size }, 'client connected')
    return id
  }

  removeClient(id: string) {
    this.clients.delete(id)
    log.debug({ clientId: id, totalClients: this.clients.size }, 'client disconnected')
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
            log.debug({ clientId, channels: msg.channels }, 'client subscribed')
          }
          break

        case 'unsubscribe':
          if (msg.channels) {
            const client = this.clients.get(clientId)
            if (client) {
              for (const ch of msg.channels) client.channels.delete(ch)
            }
            log.debug({ clientId, channels: msg.channels }, 'client unsubscribed')
          }
          break

        case 'ping':
          this.clients.get(clientId)?.ws.send(JSON.stringify({ event: 'pong' }))
          break
      }
    } catch {
      log.debug({ clientId }, 'malformed ws message')
    }
  }

  emit(channel: string, event: WsServerEvent) {
    log.debug({ channel, event: event.event }, 'emitting event')
    const data = JSON.stringify(event)
    for (const client of this.clients.values()) {
      if (client.channels.has(channel)) {
        client.ws.send(data)
      }
    }
  }

  broadcast(event: WsServerEvent) {
    log.debug({ event: event.event, clientCount: this.clients.size }, 'broadcasting event')
    const data = JSON.stringify(event)
    for (const client of this.clients.values()) {
      client.ws.send(data)
    }
  }

  get clientCount() {
    return this.clients.size
  }
}
