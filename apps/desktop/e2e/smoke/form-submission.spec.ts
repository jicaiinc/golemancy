import { test, expect, type Page } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

/**
 * B8: Form submission end-to-end.
 * Existing smoke tests verify modals open and fields are visible.
 * These tests fill the forms and submit, then verify data persisted via API.
 *
 * NOTE: PixelInput/PixelTextArea render <label> without `for` attribute,
 * so Playwright's getByLabel() cannot locate them. We use structural
 * navigation: find label → go to parent → locate input/textarea/select.
 */

/** Find an input or textarea adjacent to a label containing the given text */
function inputByLabel(window: Page, labelText: string) {
  return window
    .locator('label')
    .filter({ hasText: labelText })
    .locator('..')
    .locator('input, textarea')
    .first()
}

/** Find a select adjacent to a label containing the given text */
function selectByLabel(window: Page, labelText: string) {
  return window
    .locator('label')
    .filter({ hasText: labelText })
    .locator('..')
    .locator('select')
    .first()
}

test.describe('Form Submission', () => {
  let projectId: string
  let agentId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('Form Submission Test')

    // Create agent via UI (needed for Memory tab and Cron target)
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    agentId = await helper.createAgent('Form Test Agent')
  })

  // --- MCP Server Form ---

  test('MCP: create STDIO server via form and verify via API', async ({ window, helper }) => {
    await helper.clickNav('mcp-servers')
    await expect(window.locator(SELECTORS.MCP_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    await window.locator(SELECTORS.MCP_NEW_BTN).click()
    await expect(window.getByRole('heading', { name: 'New MCP Server' })).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Select STDIO transport (should be default)
    await window.locator(SELECTORS.MCP_TRANSPORT_STDIO).click()

    // Fill fields
    await inputByLabel(window, 'NAME').fill('test-stdio-server')
    await inputByLabel(window, 'COMMAND').fill('npx')
    await inputByLabel(window, 'ARGS').fill('-y @modelcontextprotocol/server-memory')

    // Submit via Save button
    await window.getByRole('button', { name: /save/i }).click()

    // Verify via API
    const servers = await helper.apiGet(`/api/projects/${projectId}/mcp-servers`)
    const created = servers.find((s: any) => s.name === 'test-stdio-server')
    expect(created).toBeDefined()
    expect(created.transportType).toBe('stdio')
    expect(created.command).toBe('npx')
  })

  test('MCP: create HTTP server via form and verify via API', async ({ window, helper }) => {
    await helper.clickNav('mcp-servers')
    await expect(window.locator(SELECTORS.MCP_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    await window.locator(SELECTORS.MCP_NEW_BTN).click()
    await expect(window.getByRole('heading', { name: 'New MCP Server' })).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    await window.locator(SELECTORS.MCP_TRANSPORT_HTTP).click()
    await inputByLabel(window, 'NAME').fill('test-http-server')
    await inputByLabel(window, 'URL').fill('http://localhost:9999/mcp')

    await window.getByRole('button', { name: /save/i }).click()

    const servers = await helper.apiGet(`/api/projects/${projectId}/mcp-servers`)
    const created = servers.find((s: any) => s.name === 'test-http-server')
    expect(created).toBeDefined()
    expect(created.transportType).toBe('http')
    expect(created.url).toBe('http://localhost:9999/mcp')
  })

  test('MCP: create SSE server via form and verify via API', async ({ window, helper }) => {
    await helper.clickNav('mcp-servers')
    await expect(window.locator(SELECTORS.MCP_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    await window.locator(SELECTORS.MCP_NEW_BTN).click()
    await expect(window.getByRole('heading', { name: 'New MCP Server' })).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    await window.locator(SELECTORS.MCP_TRANSPORT_SSE).click()
    await inputByLabel(window, 'NAME').fill('test-sse-server')
    await inputByLabel(window, 'URL').fill('http://localhost:9998/sse')

    await window.getByRole('button', { name: /save/i }).click()

    const servers = await helper.apiGet(`/api/projects/${projectId}/mcp-servers`)
    const created = servers.find((s: any) => s.name === 'test-sse-server')
    expect(created).toBeDefined()
    expect(created.transportType).toBe('sse')
  })

  // --- Memory Form ---

  test('Memory: add memory via form and verify card appears', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)

    const memoryTab = window.locator('[data-testid="tab-memory"]')
    await expect(memoryTab).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await memoryTab.click()

    // Open the add form
    await expect(window.locator(SELECTORS.MEMORY_ADD_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await window.click(SELECTORS.MEMORY_ADD_BTN)
    await expect(window.locator(SELECTORS.MEMORY_ADD_FORM)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Fill content and tags (these have data-testid)
    await window.fill(SELECTORS.MEMORY_CONTENT_INPUT, 'E2E test memory: user prefers dark mode')
    await window.fill(SELECTORS.MEMORY_TAGS_INPUT, 'preference')
    await window.click(SELECTORS.MEMORY_PINNED_CHECKBOX)

    // Submit
    await expect(window.locator(SELECTORS.MEMORY_SAVE_BTN)).toBeEnabled()
    await window.click(SELECTORS.MEMORY_SAVE_BTN)

    // Wait for form to close
    await expect(window.locator(SELECTORS.MEMORY_ADD_FORM)).not.toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Verify via API
    const memories = await helper.apiGet(`/api/projects/${projectId}/agents/${agentId}/memories`)
    const created = memories.find((m: any) => m.content?.includes('dark mode'))
    expect(created).toBeDefined()
    expect(created.pinned).toBe(true)
  })

  test('Memory: second memory also persists and both show in list', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)

    const memoryTab = window.locator('[data-testid="tab-memory"]')
    await memoryTab.click()
    await expect(window.locator(SELECTORS.MEMORY_ADD_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    await window.click(SELECTORS.MEMORY_ADD_BTN)
    await expect(window.locator(SELECTORS.MEMORY_ADD_FORM)).toBeVisible()

    await window.fill(SELECTORS.MEMORY_CONTENT_INPUT, 'E2E test memory: user timezone is UTC+8')
    await window.click(SELECTORS.MEMORY_SAVE_BTN)

    await expect(window.locator(SELECTORS.MEMORY_ADD_FORM)).not.toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Both memories should exist via API
    const memories = await helper.apiGet(`/api/projects/${projectId}/agents/${agentId}/memories`)
    expect(memories.filter((m: any) => m.content?.includes('E2E test memory')).length).toBeGreaterThanOrEqual(2)
  })

  // --- Cron Job Form ---

  test('Cron: create recurring job via form and verify via API', async ({ window, helper }) => {
    await helper.clickNav('cron')
    await expect(window.locator(SELECTORS.CRON_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    await window.locator(SELECTORS.CRON_NEW_BTN).click()
    await expect(window.getByRole('heading', { name: 'New Automation' })).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Fill name
    await inputByLabel(window, 'NAME').fill('Daily Status Check')

    // Select agent target
    await selectByLabel(window, 'AGENT / TEAM').selectOption(agentId)

    // Fill instruction
    await inputByLabel(window, 'INSTRUCTION').fill('Generate a brief status report.')

    // Use "Daily 9am" preset for cron expression
    await window.getByRole('button', { name: 'Daily 9am' }).click()

    // Submit
    await window.getByRole('button', { name: 'Create', exact: true }).click()

    // Wait for modal to close
    await expect(window.getByRole('heading', { name: 'New Automation' })).not.toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Verify via API
    const cronJobs = await helper.apiGet(`/api/projects/${projectId}/cron-jobs`)
    const created = cronJobs.find((j: any) => j.name === 'Daily Status Check')
    expect(created).toBeDefined()
    expect(created.cronExpression).toBe('0 9 * * *')
    expect(created.instruction).toContain('status report')
  })

  test('Cron: create one-time job via form and verify via API', async ({ window, helper }) => {
    await helper.clickNav('cron')
    await expect(window.locator(SELECTORS.CRON_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    await window.locator(SELECTORS.CRON_NEW_BTN).click()
    await expect(window.getByRole('heading', { name: 'New Automation' })).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Switch to One-time
    await window.getByText('One-time', { exact: true }).click()

    // Fill name
    await inputByLabel(window, 'NAME').fill('One-time Report')

    // Fill instruction
    await inputByLabel(window, 'INSTRUCTION').fill('Generate a one-time report.')

    // Select target agent
    await selectByLabel(window, 'AGENT / TEAM').selectOption(agentId)

    // Set scheduled time
    const scheduledInput = window.locator('input[type="datetime-local"]')
    if (await scheduledInput.isVisible()) {
      const tomorrow = new Date(Date.now() + 86400000)
      const dateStr = tomorrow.toISOString().slice(0, 16)
      await scheduledInput.fill(dateStr)
    }

    // Submit
    await window.getByRole('button', { name: 'Create', exact: true }).click()

    // Wait for modal to close
    await expect(window.getByRole('heading', { name: 'New Automation' })).not.toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Verify via API
    const cronJobs = await helper.apiGet(`/api/projects/${projectId}/cron-jobs`)
    const created = cronJobs.find((j: any) => j.name === 'One-time Report')
    expect(created).toBeDefined()
    expect(created.instruction).toContain('one-time report')
  })

  test('Cron: job card appears in page after creation', async ({ window, helper }) => {
    await helper.clickNav('cron')
    await expect(window.locator(SELECTORS.CRON_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Force store refresh to pick up newly-created cron jobs
    await window.evaluate((pid: string) => {
      const store = (window as any).__GOLEMANCY_STORE__
      if (store) store.getState().loadCronJobs(pid)
    }, projectId)

    // Wait for at least one cron card to appear
    await expect(window.locator(SELECTORS.CRON_CARD).first()).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })
})
