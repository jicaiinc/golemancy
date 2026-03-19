import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Task Tool — Agent Creates Tasks', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string
  let agentId: string
  let createConvId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    const project = await helper.createProjectViaApi('Task Tool Test')
    projectId = project.id

    // Create a tool-reliable agent with task tool enabled
    const agent = await helper.createToolAgent(projectId, 'Task Agent', {
      systemPrompt:
        'You have a task tool. When asked to create a task, use the task tool to create it with the exact subject given. Do not explain, just create the task.',
      builtinTools: { task: true, bash: false, browser: false, computer_use: false, memory: false },
    })
    agentId = agent.id
  })

  test('agent creates a task via task tool', async ({ helper }) => {
    test.setTimeout(120_000)

    const conv = await helper.createConversationViaApi(projectId, agentId, 'Task Create Test')
    createConvId = conv.id
    await helper.enterConversation(projectId, conv.id)
    const response = await helper.sendAndWaitForResponse(
      "Create a task with subject 'E2E Test Task'",
      TIMEOUTS.AI_RESPONSE,
    )

    // The agent should have responded and tool call should be visible
    expect(response).toBeTruthy()
    expect(await helper.hasToolCall()).toBe(true)

    // Verify the task was actually created via API (task field is "subject", not "title")
    const tasks = await helper.apiGet(`/api/projects/${projectId}/tasks?conversationId=${conv.id}`)
    const taskList = Array.isArray(tasks) ? tasks : tasks.tasks ?? []
    const subjects: string[] = taskList.map((t: any) => t.subject ?? '')
    expect(subjects.some((s: string) => s.includes('E2E Test Task'))).toBe(true)
  })

  test('agent can list tasks', async ({ helper }) => {
    test.setTimeout(120_000)

    // Use the SAME conversation so the agent can see the previously created task
    await helper.enterConversation(projectId, createConvId)
    const response = await helper.sendAndWaitForResponse(
      'List all current tasks. Show their subjects.',
      TIMEOUTS.AI_RESPONSE,
    )

    // Should mention the previously created task
    expect(response).toBeTruthy()
    expect(response).toContain('E2E Test Task')
  })

  test('agent can update a task status', async ({ helper }) => {
    test.setTimeout(120_000)

    // Use the SAME conversation so the agent can see and update the task
    await helper.enterConversation(projectId, createConvId)
    const response = await helper.sendAndWaitForResponse(
      "Mark the task with subject 'E2E Test Task' as completed.",
      TIMEOUTS.AI_RESPONSE,
    )

    // The agent should confirm the update
    expect(response).toBeTruthy()

    // Verify task was updated via API
    const tasks = await helper.apiGet(`/api/projects/${projectId}/tasks?conversationId=${createConvId}`)
    const taskList = Array.isArray(tasks) ? tasks : tasks.tasks ?? []
    const updatedTask = taskList.find(
      (t: any) => (t.subject ?? '').includes('E2E Test Task'),
    )
    // Task should exist and ideally be marked completed
    expect(updatedTask).toBeTruthy()
    if (updatedTask) {
      expect(
        updatedTask.status === 'completed' ||
          updatedTask.status === 'done' ||
          updatedTask.completed === true,
      ).toBe(true)
    }
  })
})
