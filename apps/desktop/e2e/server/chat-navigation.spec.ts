import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

test.describe('Chat Navigation', () => {
  let projectId: string
  let agent1Id: string
  let agent2Id: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()

    const project = await helper.createProjectViaApi('Chat Nav Test')
    projectId = project.id

    const agent1 = await helper.createAgentViaApi(projectId, 'Nav Agent 1')
    agent1Id = agent1.id

    const agent2 = await helper.createAgentViaApi(projectId, 'Nav Agent 2')
    agent2Id = agent2.id
  })

  // ===== URL Sync =====

  test('navigating to ?conv=id syncs selectedConversationId in store', async ({ helper }) => {
    const conv = await helper.apiPost(`/api/projects/${projectId}/conversations`, {
      targetType: 'agent',
      targetId: agent1Id,
      title: 'URL Sync Test',
    })

    await helper.navigateTo(`/projects/${projectId}/chat?conv=${conv.id}`)

    await helper.store.waitFor(
      `state.currentConversationId === "${conv.id}"`,
      TIMEOUTS.PAGE_LOAD,
    )

    const selectedId = await helper.store.get<string>('currentConversationId')
    expect(selectedId).toBe(conv.id)
  })

  // ===== Agent/Team Switch — Empty Conversation =====

  test('PATCH empty conversation targetType/targetId switches agent', async ({ helper }) => {
    // Create conversation targeting agent1 (no messages)
    const conv = await helper.apiPost(`/api/projects/${projectId}/conversations`, {
      targetType: 'agent',
      targetId: agent1Id,
      title: 'Switch Empty Conv',
    })

    // Switch to agent2 via PATCH
    const updated = await helper.apiPatch(
      `/api/projects/${projectId}/conversations/${conv.id}`,
      { targetType: 'agent', targetId: agent2Id },
    )

    // Verify target was updated
    const targetId = updated.targetId ?? updated.agentId
    expect(targetId).toBe(agent2Id)

    // Verify via GET
    const fetched = await helper.apiGet(
      `/api/projects/${projectId}/conversations/${conv.id}`,
    )
    const fetchedTarget = fetched.targetId ?? fetched.agentId
    expect(fetchedTarget).toBe(agent2Id)
  })

  // ===== Agent/Team Switch — Conversation With Messages =====

  test('conversation with messages supports creating a new conversation for different agent', async ({ helper }) => {
    // Create conversation with agent1 and add messages
    const conv1 = await helper.apiPost(`/api/projects/${projectId}/conversations`, {
      targetType: 'agent',
      targetId: agent1Id,
      title: 'Conv With Messages',
    })
    await helper.saveMessageViaApi(projectId, conv1.id, {
      role: 'user',
      content: 'Hello agent 1',
    })
    await helper.saveMessageViaApi(projectId, conv1.id, {
      role: 'assistant',
      content: 'Hello!',
    })

    // When switching agent with existing messages, UI creates a new conversation
    // Verify that creating a new conversation for agent2 works independently
    const conv2 = await helper.apiPost(`/api/projects/${projectId}/conversations`, {
      targetType: 'agent',
      targetId: agent2Id,
      title: 'New Conv After Switch',
    })

    expect(conv2.id).toBeDefined()
    expect(conv2.id).not.toBe(conv1.id)

    // Original conversation still exists with its messages
    const original = await helper.apiGet(
      `/api/projects/${projectId}/conversations/${conv1.id}`,
    )
    expect(original.messages.length).toBeGreaterThanOrEqual(2)

    // New conversation is empty
    const newMessages = await helper.apiGet(
      `/api/projects/${projectId}/conversations/${conv2.id}/messages`,
    )
    expect(newMessages.items).toHaveLength(0)
  })

  // ===== Team Target =====

  test('PATCH conversation to team target type', async ({ helper }) => {
    const team = await helper.createTeamViaApi(projectId, 'Nav Team', [
      { agentId: agent1Id },
    ])

    const conv = await helper.apiPost(`/api/projects/${projectId}/conversations`, {
      targetType: 'agent',
      targetId: agent1Id,
      title: 'Switch to Team',
    })

    // Switch from agent to team target
    const updated = await helper.apiPatch(
      `/api/projects/${projectId}/conversations/${conv.id}`,
      { targetType: 'team', targetId: team.id },
    )

    expect(updated.targetType).toBe('team')
    expect(updated.targetId).toBe(team.id)
  })
})
