import type { Page } from '@playwright/test'

/**
 * Bridge to access the Zustand store exposed at `window.__GOLEMANCY_STORE__`
 * from Playwright test code.
 */
export class StoreBridge {
  constructor(private page: Page) {}

  /** Check if the store is exposed on the window */
  async isAvailable(): Promise<boolean> {
    return this.page.evaluate(() => typeof (window as any).__GOLEMANCY_STORE__ === 'function')
  }

  /** Get a full snapshot of the Zustand state */
  async getState(): Promise<Record<string, unknown>> {
    return this.page.evaluate(() => {
      const store = (window as any).__GOLEMANCY_STORE__
      if (!store) throw new Error('Store not available')
      return store.getState()
    })
  }

  /**
   * Access a nested value via dot-notation path.
   * Example: `get('currentProjectId')` or `get('projects.0.name')`
   */
  async get<T = unknown>(path: string): Promise<T> {
    return this.page.evaluate((p: string) => {
      const store = (window as any).__GOLEMANCY_STORE__
      if (!store) throw new Error('Store not available')
      const state = store.getState()
      return p.split('.').reduce((obj: any, key: string) => {
        if (obj == null) return undefined
        // Support array index access
        const idx = Number(key)
        return Number.isNaN(idx) ? obj[key] : obj[idx]
      }, state)
    }, path)
  }

  /**
   * Wait for a store state condition to become true.
   * The predicate runs inside the browser and receives the full state object.
   *
   * @param predicateBody - The body of a function `(state) => boolean`, as a string.
   *   Example: `'state.projects.length > 0'`
   * @param timeout - Max wait time in ms (default: 10_000)
   */
  async waitFor(predicateBody: string, timeout = 10_000): Promise<void> {
    await this.page.waitForFunction(
      (body: string) => {
        const store = (window as any).__GOLEMANCY_STORE__
        if (!store) return false
        const state = store.getState()
        // eslint-disable-next-line no-new-func
        const fn = new Function('state', `return ${body}`)
        return fn(state)
      },
      predicateBody,
      { timeout }
    )
  }
}
