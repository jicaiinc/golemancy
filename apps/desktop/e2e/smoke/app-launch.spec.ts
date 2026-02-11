import { test, expect } from '../fixtures'
import { SELECTORS } from '../constants'

test.describe('App Launch', () => {
  test('window opens and renders React app', async ({ window }) => {
    // The app starts at / (ProjectListPage) — no app-shell at root level
    await expect(window.locator('#root > *')).toBeAttached()
  })

  test('store bridge is available', async ({ window }) => {
    // Check directly on window — store may take a moment to initialize
    const available = await window.evaluate(() => {
      return typeof (window as any).__SOLOCRAFT_STORE__ === 'function'
    })
    // If store isn't available, it may be a production build (--mode test required)
    expect(available).toBe(true)
  })

  test('initial state is defined', async ({ helper }) => {
    const state = await helper.store.getState()
    expect(state).toBeDefined()
    expect(state).toHaveProperty('projects')
  })

  test('project list page is displayed by default', async ({ window, helper }) => {
    await helper.goHome()
    await expect(window.locator(SELECTORS.CREATE_PROJECT_BTN)).toBeVisible()
  })
})
