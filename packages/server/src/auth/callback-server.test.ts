import { describe, it, expect, afterEach } from 'vitest'
import http from 'node:http'
import { startCallbackServer } from './callback-server'

function httpGet(port: number, path: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}${path}`, { agent: false }, (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolve({ statusCode: res.statusCode!, body }))
    })
    req.on('error', reject)
    req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

describe('callback-server', () => {
  let closeFn: (() => void) | undefined
  let caughtResult: Promise<unknown> | undefined

  afterEach(async () => {
    closeFn?.()
    closeFn = undefined
    if (caughtResult) {
      await caughtResult
      caughtResult = undefined
    }
    await wait(500) // ensure port is released
  })

  describe('dynamic port (port=0, default)', () => {
    it('binds to an OS-assigned port and reports it via listening', async () => {
      const { promise, close, listening } = startCallbackServer('s', { timeoutMs: 10000 })
      closeFn = close
      caughtResult = promise.catch(() => 'rejected')

      const port = await listening
      expect(port).toBeGreaterThan(0)
      expect(port).not.toBe(1455) // OS picks an ephemeral port, not Codex-legacy

      const res = await httpGet(port, `/auth/callback?code=abc&state=s`)
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('Authorized')

      const result = await promise
      expect(result.code).toBe('abc')
      closeFn = undefined
      caughtResult = undefined
    })

    it('uses port=0 when opts is omitted entirely', async () => {
      const { close, listening, promise } = startCallbackServer('s')
      closeFn = close
      caughtResult = promise.catch(() => 'rejected')

      const port = await listening
      expect(port).toBeGreaterThan(0)
      expect(port).not.toBe(1455)
    })

    it('two concurrent dynamic-port servers bind to different ports without conflict', async () => {
      const a = startCallbackServer('a', { timeoutMs: 10000 })
      const b = startCallbackServer('b', { timeoutMs: 10000 })
      const aRej = a.promise.catch(() => 'rejected')
      const bRej = b.promise.catch(() => 'rejected')

      const [portA, portB] = await Promise.all([a.listening, b.listening])
      expect(portA).not.toBe(portB)
      expect(portA).toBeGreaterThan(0)
      expect(portB).toBeGreaterThan(0)

      a.close()
      b.close()
      await aRej
      await bRej
    })
  })

  describe('fixed port (Codex-legacy 1455)', () => {
    it('binds to 1455 when explicitly requested', async () => {
      const { promise, close, listening } = startCallbackServer('s', { port: 1455, timeoutMs: 10000 })
      closeFn = close
      caughtResult = promise.catch(() => 'rejected')

      const port = await listening
      expect(port).toBe(1455)

      const res = await httpGet(1455, `/auth/callback?code=abc&state=s`)
      expect(res.statusCode).toBe(200)

      await promise
      closeFn = undefined
      caughtResult = undefined
    })

    it('handles /cancel endpoint on fixed port', async () => {
      const { promise, close, listening } = startCallbackServer('state', { port: 1455, timeoutMs: 10000 })
      closeFn = close
      const rejection = promise.catch(err => err as Error)

      await listening

      const res = await httpGet(1455, '/cancel')
      expect(res.statusCode).toBe(200)

      const err = await rejection
      expect(err).toBeInstanceOf(Error)
      expect(err.message).toContain('cancelled')
      closeFn = undefined
      caughtResult = undefined
    }, 15000)
  })

  describe('error paths', () => {
    it('rejects on state mismatch and stays running until close', async () => {
      const { promise, close, listening } = startCallbackServer('correct-state', { timeoutMs: 10000 })
      closeFn = close
      caughtResult = promise.catch(() => 'rejected')

      const port = await listening

      const res = await httpGet(port, '/auth/callback?code=abc&state=wrong-state')
      expect(res.statusCode).toBe(400)
      expect(res.body).toContain('State mismatch')

      close()
      closeFn = undefined

      const outcome = await caughtResult
      expect(outcome).toBe('rejected')
      caughtResult = undefined
    })

    it('rejects on OAuth error parameter', async () => {
      const { promise, close, listening } = startCallbackServer('state', { timeoutMs: 10000 })
      closeFn = close
      const rejection = promise.catch(err => err as Error)

      const port = await listening

      const res = await httpGet(port, '/auth/callback?error=access_denied')
      expect(res.statusCode).toBe(400)

      const err = await rejection
      expect(err).toBeInstanceOf(Error)
      expect(err.message).toContain('access_denied')
      closeFn = undefined
      caughtResult = undefined
    })

    it('returns 404 for unknown paths', async () => {
      const { promise, close, listening } = startCallbackServer('state', { timeoutMs: 10000 })
      closeFn = close
      caughtResult = promise.catch(() => 'rejected')

      const port = await listening

      const res = await httpGet(port, '/unknown')
      expect(res.statusCode).toBe(404)

      close()
      closeFn = undefined
      await caughtResult
      caughtResult = undefined
    })

  })
})
