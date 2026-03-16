import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Team With Tools', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    const project = await helper.createProjectViaApi('Team With Tools Test')
    projectId = project.id
  })

  test('leader delegates to worker who uses bash to read seeded file', async ({ helper }) => {
    test.setTimeout(180_000)

    const marker = `TOOL_MARKER_${Date.now()}_BASH`

    // Create leader (no tools) — must delegate
    const leader = await helper.createToolAgent(projectId, 'Bash Team Leader', {
      systemPrompt: [
        'You are a team leader. You MUST delegate all tasks to your team members.',
        'When asked to read a file, delegate to the Worker who has bash access.',
        'Include the exact file content from the Worker in your final response.',
      ].join(' '),
    })

    // Create worker with bash tool
    const worker = await helper.createToolAgent(projectId, 'Bash Worker', {
      systemPrompt: [
        'You are a worker with bash access.',
        'When asked to read a file, use bash to cat the file and report its exact content.',
        'Always include the full file content in your response.',
      ].join(' '),
      builtinTools: {
        bash: true,
        browser: false,
        task: false,
        memory: false,
        computer_use: false,
      },
    })

    // Apply unrestricted permissions so bash works
    const config = await helper.createPermissionsConfigViaApi(projectId, {
      title: 'Unrestricted for Team Bash',
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
    await helper.applyPermissionsConfig(projectId, config.id)

    // Create team: leader → worker
    const team = await helper.apiPost(`/api/projects/${projectId}/teams`, {
      name: 'Bash Tool Team',
      description: 'Leader delegates to Worker with bash',
      instruction: 'The leader must always delegate file operations to the Worker.',
      members: [
        { agentId: leader.id },
        { agentId: worker.id, parentAgentId: leader.id },
      ],
    })

    // Seed workspace file with unique marker
    helper.seedWorkspaceFile(projectId, 'tool-test.txt', marker)

    // Start team chat
    const { response, events } = await helper.createTeamChatViaApi(
      projectId,
      team.id,
      'Please read the file tool-test.txt and tell me its exact content.',
      TIMEOUTS.AI_RESPONSE,
    )

    // Verify delegation happened
    const delegationEvents = events.filter(
      (e) =>
        e.type === 'tool_call' &&
        typeof e.data?.toolName === 'string' &&
        e.data.toolName.includes('delegate_to_'),
    )
    expect(delegationEvents.length).toBeGreaterThanOrEqual(1)

    // Primary assertion: the marker content was retrieved and included in response
    expect(response).toContain(marker)

    // Secondary: verify the seeded file still exists (was read, not deleted)
    expect(helper.workspaceFileExists(projectId, 'tool-test.txt')).toBe(true)
  })

  test('leader delegates memory task to worker with memory tool', async ({ helper }) => {
    test.setTimeout(180_000)

    const memoryMarker = `MEMORY_TEAM_${Date.now()}_SAVE`

    // Create leader
    const leader = await helper.createToolAgent(projectId, 'Memory Team Leader', {
      systemPrompt: [
        'You are a team leader. Delegate all memory-related tasks to the Memory Worker.',
        'When asked to remember something, delegate to the Memory Worker to save it.',
      ].join(' '),
    })

    // Create worker with memory tool
    const worker = await helper.createToolAgent(projectId, 'Memory Worker', {
      systemPrompt: [
        'You are a worker with memory tools.',
        'When asked to remember something, use the memory tool to save it immediately.',
        'Confirm what you saved.',
      ].join(' '),
      builtinTools: {
        bash: false,
        browser: false,
        task: false,
        memory: true,
        computer_use: false,
      },
    })

    // Create team
    const team = await helper.apiPost(`/api/projects/${projectId}/teams`, {
      name: 'Memory Tool Team',
      description: 'Leader delegates to Worker with memory',
      instruction: 'The leader must delegate memory operations to the Memory Worker.',
      members: [
        { agentId: leader.id },
        { agentId: worker.id, parentAgentId: leader.id },
      ],
    })

    // Send team chat to save a memory
    const { response, events } = await helper.createTeamChatViaApi(
      projectId,
      team.id,
      `Please remember this code in memory: ${memoryMarker}`,
      TIMEOUTS.AI_RESPONSE,
    )

    // Verify delegation happened
    const delegationEvents = events.filter(
      (e) =>
        e.type === 'tool_call' &&
        typeof e.data?.toolName === 'string' &&
        e.data.toolName.includes('delegate_to_'),
    )
    expect(delegationEvents.length).toBeGreaterThanOrEqual(1)

    // Response should confirm the save (not an error)
    expect(response.length).toBeGreaterThan(10)
    expect(response).not.toMatch(/error|failed|unable/i)

    // Primary non-text assertion: verify memory was actually created via API
    // Check both agents' memories since the worker is the one who saves
    const workerMemories = await helper.apiGet(
      `/api/projects/${projectId}/agents/${worker.id}/memories`,
    )
    const leaderMemories = await helper.apiGet(
      `/api/projects/${projectId}/agents/${leader.id}/memories`,
    )

    const allMemories = [...(workerMemories ?? []), ...(leaderMemories ?? [])]
    const saved = allMemories.some((m: any) =>
      String(m?.content ?? '').includes(memoryMarker),
    )
    expect(saved).toBe(true)
  })

  test('leader delegates bash write and result is verified on disk', async ({ helper }) => {
    test.setTimeout(180_000)

    const writeMarker = `TEAM_WRITE_${Date.now()}_DISK`
    const relativePath = 'team-output.txt'
    helper.removeWorkspaceFile(projectId, relativePath)

    // Create leader
    const leader = await helper.createToolAgent(projectId, 'Write Team Leader', {
      systemPrompt: [
        'You are a team leader. Delegate all file writing tasks to the Writer.',
        'When asked to write a file, delegate to the Writer.',
      ].join(' '),
    })

    // Create writer with bash
    const writer = await helper.createToolAgent(projectId, 'Writer', {
      systemPrompt: [
        'You are a writer with bash access.',
        'When asked to write content to a file, use bash to write it.',
        'Report success after writing.',
      ].join(' '),
      builtinTools: {
        bash: true,
        browser: false,
        task: false,
        memory: false,
        computer_use: false,
      },
    })

    // Apply unrestricted
    const config = await helper.createPermissionsConfigViaApi(projectId, {
      title: 'Unrestricted for Team Write',
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
    await helper.applyPermissionsConfig(projectId, config.id)

    // Create team
    const team = await helper.apiPost(`/api/projects/${projectId}/teams`, {
      name: 'Write Tool Team',
      description: 'Leader delegates writes to Writer',
      instruction: 'The leader must delegate file writing to the Writer.',
      members: [
        { agentId: leader.id },
        { agentId: writer.id, parentAgentId: leader.id },
      ],
    })

    await helper.createTeamChatViaApi(
      projectId,
      team.id,
      `Write the text "${writeMarker}" to a file called team-output.txt`,
      TIMEOUTS.AI_RESPONSE,
    )

    // Primary assertion: file was created on disk with the correct content
    expect(helper.workspaceFileExists(projectId, relativePath)).toBe(true)
    expect(helper.readWorkspaceFile(projectId, relativePath).trim()).toContain(writeMarker)
  })
})
