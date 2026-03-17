import os from 'node:os'
import path from 'node:path'
import { test, expect } from '../fixtures'
import type { TestHelper } from '../fixtures'
import { ROOT_DIR, TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

const sideEffectServerPath = path.join(
  ROOT_DIR,
  'apps/desktop/e2e/fixtures/mcp-stdio-side-effect-server.mjs',
)

type SetupResult = {
  projectId: string
  agentId: string
  startupMarkerPath: string
  targetFilePath: string
}

async function setupApplyToMcpProject(
  helper: TestHelper,
  opts: { applyToMCP: boolean; suffix: string },
): Promise<SetupResult> {
  const project = await helper.createProjectViaApi(`applyToMCP ${opts.suffix}`)
  const projectId = project.id

  const startupMarkerPath = path.join(os.homedir(), `.golemancy-mcp-startup-${opts.suffix}.txt`)
  const targetFilePath = path.join(os.homedir(), `.golemancy-mcp-target-${opts.suffix}.txt`)
  helper.removeFileIfExists(startupMarkerPath)
  helper.removeFileIfExists(targetFilePath)

  const permissions = await helper.createPermissionsConfigViaApi(projectId, {
    title: `Sandbox ${opts.suffix}`,
    mode: 'sandbox',
    config: {
      allowWrite: ['{{workspaceDir}}'],
      denyRead: [],
      denyWrite: [],
      networkRestrictionsEnabled: false,
      allowedDomains: [],
      deniedDomains: [],
      deniedCommands: [],
      applyToMCP: opts.applyToMCP,
    },
  })
  await helper.applyPermissionsConfig(projectId, permissions.id)

  await helper.apiPost(`/api/projects/${projectId}/mcp-servers`, {
    name: 'side-effect-mcp',
    transportType: 'stdio',
    command: process.execPath,
    args: [sideEffectServerPath],
    env: {
      E2E_STARTUP_MARKER_PATH: startupMarkerPath,
    },
    description: 'Deterministic side-effect MCP server for applyToMCP tests',
  })

  const agent = await helper.createToolAgent(projectId, `applyToMCP Agent ${opts.suffix}`, {
    systemPrompt: [
      'You have access to MCP tools.',
      'When asked to write a file, you must use the write_marker tool.',
      'Report the MCP tool result briefly.',
    ].join(' '),
    builtinTools: {
      bash: false,
      browser: false,
      task: false,
      memory: false,
      computer_use: false,
    },
  })

  await helper.assignMcpToAgent(projectId, agent.id, 'side-effect-mcp')

  return {
    projectId,
    agentId: agent.id,
    startupMarkerPath,
    targetFilePath,
  }
}

test.describe('MCP applyToMCP Sandbox Wrapping', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  test('applyToMCP=true wraps stdio MCP in sandbox and prevents host side effects', async ({ helper }) => {
    test.setTimeout(120_000)

    const setup = await setupApplyToMcpProject(helper, {
      applyToMCP: true,
      suffix: 'wrapped',
    })

    const conv = await helper.createConversationViaApi(
      setup.projectId,
      setup.agentId,
      'applyToMCP wrapped runtime',
    )
    const marker = 'APPLY_TO_MCP_WRAPPED'
    await helper.sendChatViaApi(
      setup.projectId,
      setup.agentId,
      conv.id,
      `Use the write_marker MCP tool to write "${marker}" to "${setup.targetFilePath}". Then tell me the result.`,
      TIMEOUTS.AI_RESPONSE,
    )
    expect(helper.readFileIfExists(setup.startupMarkerPath)).toBeNull()
    expect(helper.readFileIfExists(setup.targetFilePath)).toBeNull()
    helper.removeFileIfExists(setup.startupMarkerPath)
    helper.removeFileIfExists(setup.targetFilePath)
  })

  test('applyToMCP=false leaves stdio MCP unwrapped and allows host side effects', async ({ helper }) => {
    test.setTimeout(120_000)

    const setup = await setupApplyToMcpProject(helper, {
      applyToMCP: false,
      suffix: 'bypass',
    })

    const conv = await helper.createConversationViaApi(
      setup.projectId,
      setup.agentId,
      'applyToMCP bypass runtime',
    )
    const marker = 'APPLY_TO_MCP_BYPASS'
    await helper.sendChatViaApi(
      setup.projectId,
      setup.agentId,
      conv.id,
      `Use the write_marker MCP tool to write "${marker}" to "${setup.targetFilePath}". Then tell me the result.`,
      TIMEOUTS.AI_RESPONSE,
    )
    expect(helper.readFileIfExists(setup.startupMarkerPath)).toBe('startup-ok')
    expect(helper.readFileIfExists(setup.targetFilePath)).toBe(marker)
    helper.removeFileIfExists(setup.startupMarkerPath)
    helper.removeFileIfExists(setup.targetFilePath)
  })
})
