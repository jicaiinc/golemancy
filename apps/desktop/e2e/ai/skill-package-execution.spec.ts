import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'
import { buildSkillZip } from '../fixtures/skill-zip'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Packaged Skill Execution', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    const project = await helper.createProjectViaApi('Packaged Skill Execution')
    projectId = project.id

    const unrestricted = await helper.createPermissionsConfigViaApi(projectId, {
      title: 'Unrestricted for packaged skills',
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
    })
    await helper.applyPermissionsConfig(projectId, unrestricted.id)
  })

  test('packaged skill with scripts can be imported and executed by the agent', async ({ helper }) => {
    test.setTimeout(180_000)

    const marker = `SCRIPT_PACKAGE_${Date.now()}`
    const sideEffectPath = 'script-package-output.txt'
    helper.removeWorkspaceFile(projectId, sideEffectPath)

    const buffer = buildSkillZip({
      directory: 'script-runner',
      name: 'Script Runner',
      description: 'Runs a bundled Python script to emit a marker',
      instructions: [
        'When asked for the bundled script marker, load this skill with the skill tool first.',
        'The skill tool returns an absolute skill.path for this skill.',
        'Use the bash tool to run: python "<skill.path>/scripts/write_marker.py". Do not guess or invent any other path.',
        'Reply with only the script output.',
      ].join(' '),
      extraFiles: [
        {
          path: 'scripts/write_marker.py',
          content: [
            'from pathlib import Path',
            `marker = "${marker}"`,
            `Path("${sideEffectPath}").write_text(marker, encoding="utf-8")`,
            'print(marker)',
          ].join('\n'),
        },
      ],
    })

    const upload = await helper.apiPostMultipartRaw(`/api/projects/${projectId}/skills/import-zip`, {
      file: {
        name: 'script-runner.zip',
        mimeType: 'application/zip',
        buffer,
      },
    })
    expect(upload.status()).toBe(201)
    const body = await upload.json()
    const skillId = body.imported[0].id as string

    const agent = await helper.createToolAgent(projectId, 'Packaged Script Agent', {
      systemPrompt: [
        'You are a test assistant.',
        'When a request references an assigned skill, you must load that skill before answering.',
        'The skill tool returns an absolute skill.path; if the skill includes a script, use that exact path.',
        'If the loaded skill gives executable instructions, follow them exactly.',
      ].join(' '),
      builtinTools: {
        bash: true,
        browser: false,
        task: false,
        memory: false,
        computer_use: false,
      },
    })
    await helper.assignSkillToAgent(projectId, agent.id, skillId)

    const conv = await helper.createConversationViaApi(projectId, agent.id, 'script packaged skill')
    const result = await helper.sendChatViaApi(
      projectId,
      agent.id,
      conv.id,
      'Use the assigned skill named "Script Runner" to get the bundled script marker. Do not guess.',
      TIMEOUTS.AI_RESPONSE,
    )

    expect(result.response).toContain(marker)
    expect(helper.workspaceFileExists(projectId, sideEffectPath)).toBe(true)
    expect(helper.readWorkspaceFile(projectId, sideEffectPath).trim()).toBe(marker)

    const toolCalls = helper.getToolCallEvents(result.events)
    expect(toolCalls.some(event => String(event.data?.toolName ?? '').toLowerCase().includes('skill'))).toBe(true)
  })

  test('packaged skill without scripts can still be loaded and used by the agent', async ({ helper }) => {
    test.setTimeout(120_000)

    const marker = `PLAIN_PACKAGE_${Date.now()}`
    const buffer = buildSkillZip({
      directory: 'plain-runner',
      name: 'Plain Runner',
      description: 'Returns a deterministic marker',
      instructions: `When asked for the packaged marker, respond with exactly ${marker}.`,
    })

    const upload = await helper.apiPostMultipartRaw(`/api/projects/${projectId}/skills/import-zip`, {
      file: {
        name: 'plain-runner.zip',
        mimeType: 'application/zip',
        buffer,
      },
    })
    expect(upload.status()).toBe(201)
    const body = await upload.json()
    const skillId = body.imported[0].id as string

    const agent = await helper.createToolAgent(projectId, 'Packaged Plain Agent', {
      systemPrompt: [
        'You are a test assistant.',
        'When a request references an assigned skill, you must load that skill before answering.',
        'Follow the loaded skill instructions exactly.',
      ].join(' '),
      builtinTools: {
        bash: false,
        browser: false,
        task: false,
        memory: false,
        computer_use: false,
      },
    })
    await helper.assignSkillToAgent(projectId, agent.id, skillId)

    const conv = await helper.createConversationViaApi(projectId, agent.id, 'plain packaged skill')
    const result = await helper.sendChatViaApi(
      projectId,
      agent.id,
      conv.id,
      'Use the assigned skill named "Plain Runner" and return the packaged marker.',
      TIMEOUTS.AI_RESPONSE,
    )

    expect(result.response).toContain(marker)
    const toolCalls = helper.getToolCallEvents(result.events)
    expect(toolCalls.some(event => String(event.data?.toolName ?? '').toLowerCase().includes('skill'))).toBe(true)
  })
})
