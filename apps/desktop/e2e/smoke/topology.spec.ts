import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Topology View', () => {
  let projectId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('Topology Test Project')
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await helper.createAgent('Topology Test Agent')
  })

  test('navigate to agents page', async ({ window, helper }) => {
    await helper.clickNav('agents')
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('topology view renders canvas', async ({ window, helper }) => {
    await helper.clickNav('agents')
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Switch to topology view by clicking the Topology button
    await window.getByText('Topology', { exact: true }).click()

    await expect(window.locator(SELECTORS.TOPOLOGY_CANVAS)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('agent node visible in topology', async ({ window, helper }) => {
    await helper.clickNav('agents')
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Switch to topology view
    await window.getByText('Topology', { exact: true }).click()
    await expect(window.locator(SELECTORS.TOPOLOGY_CANVAS)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Agent node should be rendered
    await expect(window.locator(SELECTORS.TOPOLOGY_NODE).first()).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('minimap and controls visible', async ({ window, helper }) => {
    await helper.clickNav('agents')
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Switch to topology view
    await window.getByText('Topology', { exact: true }).click()
    await expect(window.locator(SELECTORS.TOPOLOGY_CANVAS)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // ReactFlow minimap and controls
    await expect(window.locator('.react-flow__minimap')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.locator('.react-flow__controls')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })
})
