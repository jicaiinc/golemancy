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

  it('resolves with authorization code on valid callback', async () => {
    const state = 'test-state-123'
    const { promise, close } = startCallbackServer(state, 10000)
    closeFn = close
    // Track promise to avoid unhandled rejection
    caughtResult = promise.catch(() => 'rejected')

    await wait(300)

    const code = 'auth-code-abc'
    const res = await httpGet(1455, `/auth/callback?code=${code}&state=${state}`)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Authentication successful')

    const result = await promise
    expect(result.code).toBe(code)
    closeFn = undefined // already settled
    caughtResult = undefined
  })

  it('rejects on state mismatch and stays running until close', async () => {
    const state = 'correct-state'
    const { promise, close } = startCallbackServer(state, 10000)
    closeFn = close
    caughtResult = promise.catch(() => 'rejected')

    await wait(300)

    const res = await httpGet(1455, '/auth/callback?code=abc&state=wrong-state')
    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('State mismatch')

    close()
    closeFn = undefined

    const outcome = await caughtResult
    expect(outcome).toBe('rejected')
    caughtResult = undefined
  })

  it('handles /cancel endpoint', async () => {
    const { promise, close } = startCallbackServer('state', 10000)
    closeFn = close
    const rejection = promise.catch(err => err as Error)

    await wait(300)

    const res = await httpGet(1455, '/cancel')
    expect(res.statusCode).toBe(200)

    const err = await rejection
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toContain('cancelled')
    closeFn = undefined
    caughtResult = undefined
  }, 15000)

  it('rejects on OAuth error parameter', async () => {
    const { promise, close } = startCallbackServer('state', 10000)
    closeFn = close
    const rejection = promise.catch(err => err as Error)

    await wait(300)

    const res = await httpGet(1455, '/auth/callback?error=access_denied')
    expect(res.statusCode).toBe(400)

    const err = await rejection
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toContain('access_denied')
    closeFn = undefined
    caughtResult = undefined
  })

  it('returns 404 for unknown paths', async () => {
    const { promise, close } = startCallbackServer('state', 10000)
    closeFn = close
    caughtResult = promise.catch(() => 'rejected')

    await wait(300)

    const res = await httpGet(1455, '/unknown')
    expect(res.statusCode).toBe(404)

    close()
    closeFn = undefined
    await caughtResult
    caughtResult = undefined
  })
})
