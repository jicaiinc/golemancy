import { describe, it, expect, vi, beforeEach } from 'vitest'
import { captureError, setErrorCapture } from './error-reporting'

describe('error-reporting', () => {
  beforeEach(() => {
    setErrorCapture(null as any)
    window.electronAPI = undefined
    vi.restoreAllMocks()
  })

  it('captureError logs to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    captureError(new Error('test'))
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0][0]).toBeInstanceOf(Error)
    expect((spy.mock.calls[0][0] as Error).message).toBe('test')
  })

  it('captureError wraps non-Error values', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    captureError('string error')
    expect((spy.mock.calls[0][0] as Error).message).toBe('string error')
  })

  it('captureError calls IPC reportError when electronAPI is available', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reportError = vi.fn()
    window.electronAPI = { reportError } as any
    captureError(new Error('ipc test'))
    expect(reportError).toHaveBeenCalledWith({
      type: 'captured',
      message: 'ipc test',
      stack: expect.any(String),
    })
  })

  it('captureError is noop when electronAPI is undefined', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // Should not throw
    expect(() => captureError(new Error('no electron'))).not.toThrow()
  })

  it('setErrorCapture injects capture function', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const capture = vi.fn()
    setErrorCapture(capture)
    const error = new Error('captured')
    captureError(error, { component: 'test' })
    expect(capture).toHaveBeenCalledWith(error, { component: 'test' })
  })

  it('captureError skips injected capture when not set', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // No setErrorCapture called — should not throw
    expect(() => captureError(new Error('no capture'))).not.toThrow()
  })
})
