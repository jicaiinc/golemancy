import { test, expect } from '../fixtures'

test.describe('Conversation Advanced', () => {
  let projectId: string
  let agentId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()

    const project = await helper.createProjectViaApi('Conv Advanced Test')
    projectId = project.id

    const agent = await helper.createAgentViaApi(projectId, 'Conv Adv Agent')
    agentId = agent.id
  })

  // ===== Message Pagination =====

  test('GET /messages with small pageSize returns limited results and total exceeds page', async ({ helper }) => {
    const conv = await helper.apiPost(`/api/projects/${projectId}/conversations`, {
      targetType: 'agent',
      targetId: agentId,
      title: 'Pagination Test',
    })

    // Save 5 messages alternating roles
    for (let i = 0; i < 5; i++) {
      await helper.saveMessageViaApi(projectId, conv.id, {
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Pagination message ${i + 1}`,
      })
    }

    const result = await helper.apiGet(
      `/api/projects/${projectId}/conversations/${conv.id}/messages?page=1&pageSize=2`,
    )
    expect(result.items).toHaveLength(2)
    expect(result.total).toBeGreaterThan(2) // 5 messages total, page has 2
  })

  test('GET /messages page 2 returns different messages than page 1', async ({ helper }) => {
    const conv = await helper.apiPost(`/api/projects/${projectId}/conversations`, {
      targetType: 'agent',
      targetId: agentId,
      title: 'Pagination Page2 Test',
    })

    for (let i = 0; i < 4; i++) {
      await helper.saveMessageViaApi(projectId, conv.id, {
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Page2 msg ${i + 1}`,
      })
    }

    const page1 = await helper.apiGet(
      `/api/projects/${projectId}/conversations/${conv.id}/messages?page=1&pageSize=2`,
    )
    const page2 = await helper.apiGet(
      `/api/projects/${projectId}/conversations/${conv.id}/messages?page=2&pageSize=2`,
    )

    expect(page1.items).toHaveLength(2)
    expect(page2.items).toHaveLength(2)
    // Pages should contain different messages
    expect(page1.items[0].id).not.toBe(page2.items[0].id)
  })

  test('GET /messages last page has total within pageSize', async ({ helper }) => {
    const conv = await helper.apiPost(`/api/projects/${projectId}/conversations`, {
      targetType: 'agent',
      targetId: agentId,
      title: 'Pagination Last Page',
    })

    await helper.saveMessageViaApi(projectId, conv.id, {
      role: 'user',
      content: 'Only message',
    })

    const result = await helper.apiGet(
      `/api/projects/${projectId}/conversations/${conv.id}/messages?page=1&pageSize=10`,
    )
    expect(result.items.length).toBeLessThanOrEqual(10)
    expect(result.total).toBeLessThanOrEqual(10) // all fit in one page
  })

  // ===== Compact API =====

  test('POST /compact returns 400 for conversation with no messages', async ({ helper }) => {
    const conv = await helper.apiPost(`/api/projects/${projectId}/conversations`, {
      targetType: 'agent',
      targetId: agentId,
      title: 'Empty Compact Test',
    })

    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/conversations/${conv.id}/compact`,
      {},
    )
    expect(response.status()).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('NO_MESSAGES_TO_COMPACT')
  })

  test('POST /compact accepts conversation with messages (201 or 500)', async ({ helper }) => {
    const conv = await helper.apiPost(`/api/projects/${projectId}/conversations`, {
      targetType: 'agent',
      targetId: agentId,
      title: 'Compact With Messages',
    })

    await helper.saveMessageViaApi(projectId, conv.id, {
      role: 'user',
      content: 'Hello, how are you?',
    })
    await helper.saveMessageViaApi(projectId, conv.id, {
      role: 'assistant',
      content: 'I am doing well, thank you for asking!',
    })

    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/conversations/${conv.id}/compact`,
      {},
    )
    // 201 if model configured and available, 500 if model call fails — NOT 400 (validated)
    expect([201, 500]).toContain(response.status())
  })

  // ===== Conversation Filtering =====

  test('GET /conversations?agentId= returns only conversations for that agent', async ({ helper }) => {
    const agent2 = await helper.createAgentViaApi(projectId, 'Filter Agent')

    // Create conversations for different agents
    await helper.apiPost(`/api/projects/${projectId}/conversations`, {
      targetType: 'agent',
      targetId: agentId,
      title: 'Conv for Agent1',
    })
    await helper.apiPost(`/api/projects/${projectId}/conversations`, {
      targetType: 'agent',
      targetId: agent2.id,
      title: 'Conv for Agent2',
    })

    const filtered = await helper.apiGet(
      `/api/projects/${projectId}/conversations?agentId=${agent2.id}`,
    )
    expect(Array.isArray(filtered)).toBe(true)
    expect(filtered.length).toBeGreaterThanOrEqual(1)
    for (const conv of filtered) {
      // Conversation should belong to the filtered agent
      const target = conv.targetId ?? conv.agentId
      expect(target).toBe(agent2.id)
    }
  })
})
