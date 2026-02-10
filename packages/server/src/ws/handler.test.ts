import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WSContext } from 'hono/ws'
import { WebSocketManager } from './handler'
import type { WsServerEvent } from './events'

function createMockWs(): WSContext {
  return {
    send: vi.fn(),
    close: vi.fn(),
    readyState: 1,
    raw: {},
    binaryType: 'arraybuffer',
    url: null,
    protocol: null,
  } as unknown as WSContext
}

describe('WebSocketManager', () => {
  let manager: WebSocketManager

  beforeEach(() => {
    manager = new WebSocketManager()
  })

  describe('addClient / removeClient', () => {
    it('adds a client and increments count', () => {
      const ws = createMockWs()
      const id = manager.addClient(ws)
      expect(id).toMatch(/^ws-\d+$/)
      expect(manager.clientCount).toBe(1)
    })

    it('assigns unique IDs to each client', () => {
      const id1 = manager.addClient(createMockWs())
      const id2 = manager.addClient(createMockWs())
      expect(id1).not.toBe(id2)
      expect(manager.clientCount).toBe(2)
    })

    it('removes a client', () => {
      const id = manager.addClient(createMockWs())
      manager.removeClient(id)
      expect(manager.clientCount).toBe(0)
    })

    it('ignores removing non-existent client', () => {
      manager.removeClient('ws-nonexistent')
      expect(manager.clientCount).toBe(0)
    })
  })

  describe('subscribe / unsubscribe', () => {
    it('subscribes client to channels', () => {
      const ws = createMockWs()
      const id = manager.addClient(ws)

      manager.handleMessage(id, JSON.stringify({
        type: 'subscribe',
        channels: ['project:proj-1', 'agent:agent-1'],
      }))

      // Emit to one channel — should reach this client
      const event: WsServerEvent = { event: 'task:started', taskId: 'task-1' }
      manager.emit('project:proj-1', event)
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify(event))
    })

    it('unsubscribes client from channels', () => {
      const ws = createMockWs()
      const id = manager.addClient(ws)

      manager.handleMessage(id, JSON.stringify({
        type: 'subscribe', channels: ['project:proj-1'],
      }))
      manager.handleMessage(id, JSON.stringify({
        type: 'unsubscribe', channels: ['project:proj-1'],
      }))

      const event: WsServerEvent = { event: 'task:started', taskId: 'task-1' }
      manager.emit('project:proj-1', event)
      expect(ws.send).not.toHaveBeenCalled()
    })
  })

  describe('emit', () => {
    it('sends to clients subscribed to the channel', () => {
      const ws1 = createMockWs()
      const ws2 = createMockWs()
      const id1 = manager.addClient(ws1)
      const id2 = manager.addClient(ws2)

      manager.handleMessage(id1, JSON.stringify({ type: 'subscribe', channels: ['project:proj-1'] }))
      manager.handleMessage(id2, JSON.stringify({ type: 'subscribe', channels: ['project:proj-2'] }))

      const event: WsServerEvent = { event: 'task:started', taskId: 'task-1' }
      manager.emit('project:proj-1', event)

      expect(ws1.send).toHaveBeenCalledOnce()
      expect(ws2.send).not.toHaveBeenCalled()
    })

    it('sends to multiple clients on same channel', () => {
      const ws1 = createMockWs()
      const ws2 = createMockWs()
      const id1 = manager.addClient(ws1)
      const id2 = manager.addClient(ws2)

      manager.handleMessage(id1, JSON.stringify({ type: 'subscribe', channels: ['project:proj-1'] }))
      manager.handleMessage(id2, JSON.stringify({ type: 'subscribe', channels: ['project:proj-1'] }))

      const event: WsServerEvent = { event: 'agent:status_changed', agentId: 'agent-1', status: 'running' }
      manager.emit('project:proj-1', event)

      expect(ws1.send).toHaveBeenCalledOnce()
      expect(ws2.send).toHaveBeenCalledOnce()
    })

    it('does not send if no clients subscribed', () => {
      const ws = createMockWs()
      manager.addClient(ws)

      const event: WsServerEvent = { event: 'task:completed', taskId: 'task-1' }
      manager.emit('project:proj-1', event)

      expect(ws.send).not.toHaveBeenCalled()
    })
  })

  describe('broadcast', () => {
    it('sends to all connected clients', () => {
      const ws1 = createMockWs()
      const ws2 = createMockWs()
      manager.addClient(ws1)
      manager.addClient(ws2)

      const event: WsServerEvent = { event: 'server:ready' }
      manager.broadcast(event)

      expect(ws1.send).toHaveBeenCalledWith(JSON.stringify(event))
      expect(ws2.send).toHaveBeenCalledWith(JSON.stringify(event))
    })

    it('sends to clients regardless of subscriptions', () => {
      const ws = createMockWs()
      manager.addClient(ws)
      // Client has no subscriptions

      const event: WsServerEvent = { event: 'server:error', message: 'Something went wrong' }
      manager.broadcast(event)

      expect(ws.send).toHaveBeenCalledOnce()
    })
  })

  describe('ping/pong', () => {
    it('responds to ping with pong', () => {
      const ws = createMockWs()
      const id = manager.addClient(ws)

      manager.handleMessage(id, JSON.stringify({ type: 'ping' }))

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ event: 'pong' }))
    })
  })

  describe('malformed messages', () => {
    it('ignores invalid JSON', () => {
      const ws = createMockWs()
      const id = manager.addClient(ws)

      // Should not throw
      manager.handleMessage(id, 'not valid json{{{')
      expect(ws.send).not.toHaveBeenCalled()
    })

    it('ignores unknown message types', () => {
      const ws = createMockWs()
      const id = manager.addClient(ws)

      manager.handleMessage(id, JSON.stringify({ type: 'unknown_type' }))
      expect(ws.send).not.toHaveBeenCalled()
    })

    it('ignores subscribe without channels', () => {
      const ws = createMockWs()
      const id = manager.addClient(ws)

      manager.handleMessage(id, JSON.stringify({ type: 'subscribe' }))
      // Should not crash; no channels to add

      const event: WsServerEvent = { event: 'task:started', taskId: 'task-1' }
      manager.emit('project:proj-1', event)
      expect(ws.send).not.toHaveBeenCalled()
    })

    it('handles message for non-existent client', () => {
      // Should not throw
      manager.handleMessage('ws-nonexistent', JSON.stringify({ type: 'ping' }))
    })
  })

  describe('multi-channel subscriptions', () => {
    it('client receives events from all subscribed channels', () => {
      const ws = createMockWs()
      const id = manager.addClient(ws)

      manager.handleMessage(id, JSON.stringify({
        type: 'subscribe',
        channels: ['project:proj-1', 'task:task-1'],
      }))

      manager.emit('project:proj-1', { event: 'agent:status_changed', agentId: 'a-1', status: 'running' })
      manager.emit('task:task-1', { event: 'task:progress', taskId: 'task-1', progress: 50 })

      expect(ws.send).toHaveBeenCalledTimes(2)
    })

    it('partial unsubscribe only removes specified channels', () => {
      const ws = createMockWs()
      const id = manager.addClient(ws)

      manager.handleMessage(id, JSON.stringify({
        type: 'subscribe', channels: ['project:proj-1', 'task:task-1'],
      }))
      manager.handleMessage(id, JSON.stringify({
        type: 'unsubscribe', channels: ['task:task-1'],
      }))

      manager.emit('project:proj-1', { event: 'task:started', taskId: 'task-2' })
      manager.emit('task:task-1', { event: 'task:progress', taskId: 'task-1', progress: 100 })

      // Only the project event should reach the client
      expect(ws.send).toHaveBeenCalledTimes(1)
    })
  })
})
