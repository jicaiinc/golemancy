import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

/**
 * B2: Artifacts flow — agent bash tool creates files → workspace API reflects them.
 *
 * Tests the full pipeline: AI chat → bash tool execution → file written to workspace
 * → workspace API can list/read the file. This verifies the integration between
 * the agent runtime, sandbox execution, and workspace file system.
 */
test.describe('Artifacts Flow', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string
  let agentId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    const project = await helper.createProjectViaApi('Artifacts Flow Test')
    projectId = project.id

    const agent = await helper.createToolAgent(projectId, 'File Creator Agent', {
      systemPrompt:
        'You have the bash tool. When asked to create a file, use bash to write the file. Keep responses brief. Only create the file asked for, nothing else.',
      builtinTools: { bash: true, browser: false, task: false, memory: false },
    })
    agentId = agent.id

    // Apply unrestricted permissions so bash can write files
    const config = await helper.apiPost(
      `/api/projects/${projectId}/permissions-config`,
      {
        title: 'Unrestricted for Artifacts',
        mode: 'unrestricted',
        config: {
          allowWrite: [],
          denyRead: [],
          denyWrite: [],
          networkRestrictionsEnabled: false,
          allowedDomains: [],
          deniedDomains: [],
          deniedCommands: [],
          applyToMCP: false,
        },
      },
    )
    await helper.apiPatch(`/api/projects/${projectId}`, {
      permissionsConfigId: config.id,
    })
  })

  test('agent creates file via bash and file appears in workspace', async ({ helper }) => {
    test.setTimeout(120_000)

    const marker = `ARTIFACT_${Date.now()}`
    const fileName = 'test-artifact.txt'

    const conv = await helper.createConversationViaApi(projectId, agentId, 'create file')
    const result = await helper.sendChatViaApi(
      projectId, agentId, conv.id,
      `Create a file called "${fileName}" in the current directory with the content: "${marker}". Use the bash tool with echo or printf.`,
      TIMEOUTS.AI_RESPONSE,
    )

    // Verify bash tool was invoked
    const toolCalls = result.events.filter(
      (e: any) => e.type === 'tool_call' || e.type === 'tool-call',
    )
    expect(toolCalls.length).toBeGreaterThanOrEqual(1)

    // Verify the file exists in workspace via the helper
    const exists = helper.workspaceFileExists(projectId, fileName)
    expect(exists, `Expected ${fileName} to exist in workspace`).toBe(true)

    // Verify content
    const content = helper.readWorkspaceFile(projectId, fileName)
    expect(content).toContain(marker)
  })

  test('agent creates nested directory structure', async ({ helper }) => {
    test.setTimeout(120_000)

    const marker = `NESTED_${Date.now()}`

    const conv = await helper.createConversationViaApi(projectId, agentId, 'create nested')
    const result = await helper.sendChatViaApi(
      projectId, agentId, conv.id,
      `Use bash to create a directory "reports" and write a file "reports/summary.md" with content "# Summary\\n${marker}". Use mkdir -p and echo/printf.`,
      TIMEOUTS.AI_RESPONSE,
    )

    const toolCalls = result.events.filter(
      (e: any) => e.type === 'tool_call' || e.type === 'tool-call',
    )
    expect(toolCalls.length).toBeGreaterThanOrEqual(1)

    // Verify nested file exists
    const exists = helper.workspaceFileExists(projectId, 'reports/summary.md')
    expect(exists, 'Expected reports/summary.md to exist in workspace').toBe(true)

    const content = helper.readWorkspaceFile(projectId, 'reports/summary.md')
    expect(content).toContain(marker)
  })

  test('workspace API lists files created by agent', async ({ helper }) => {
    test.setTimeout(60_000)

    // Files from previous tests should be visible via workspace API
    const files = await helper.apiGet(`/api/projects/${projectId}/workspace`)

    // Should have at least the files we created
    expect(files).toBeDefined()
    const fileNames = Array.isArray(files)
      ? files.map((f: any) => f.name ?? f.path ?? f)
      : (files.files ?? files.entries ?? []).map((f: any) => f.name ?? f.path ?? f)

    // test-artifact.txt should be in the list
    const hasArtifact = fileNames.some((n: string) =>
      typeof n === 'string' && n.includes('test-artifact'),
    )
    expect(hasArtifact, `Expected workspace to contain test-artifact.txt, got: ${JSON.stringify(fileNames)}`).toBe(true)
  })
})
