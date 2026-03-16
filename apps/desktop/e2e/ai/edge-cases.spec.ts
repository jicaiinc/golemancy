import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Edge Cases', () => {
  let projectId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    const project = await helper.createProjectViaApi('Edge Cases Test')
    projectId = project.id
  })

  test('agent with no explicit model uses global default', async ({ helper }) => {
    test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')
    test.setTimeout(120_000)

    // Create agent without explicit model config (should use global default)
    const agent = await helper.createCheapAgent(projectId, 'Default Model Agent', {
      systemPrompt: 'Reply with OK and nothing else.',
    })

    const conv = await helper.createConversationViaApi(projectId, agent.id, 'Default Model Test')
    const result = await helper.sendChatViaApi(
      projectId, agent.id, conv.id,
      'Say hello.',
    )

    // Should get a valid response (not an error about missing model)
    expect(result.response).toBeTruthy()
    expect(result.response.length).toBeGreaterThan(0)
  })

  test('workspace file created by bash appears in workspace API', async ({ helper }) => {
    test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')
    test.setTimeout(120_000)

    // Create an agent with bash enabled
    const agent = await helper.createCheapAgent(projectId, 'Bash Workspace Agent', {
      systemPrompt: 'Execute commands exactly as instructed. Do not add explanations.',
      builtinTools: { bash: true },
    })

    const conv = await helper.createConversationViaApi(projectId, agent.id, 'Bash Workspace Test')
    await helper.sendChatViaApi(
      projectId, agent.id, conv.id,
      'Run this bash command: echo "e2e_workspace_test_content" > workspace_e2e_test.txt',
    )

    // Check workspace API for the file
    const workspace = await helper.apiGet(`/api/projects/${projectId}/workspace`)

    // Workspace should contain the file (may be nested or flat)
    const hasFile = JSON.stringify(workspace).includes('workspace_e2e_test')
    expect(hasFile).toBe(true)
  })

  test('conversation with 10+ messages maintains coherence', async ({ helper }) => {
    test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')
    test.setTimeout(300_000)

    const agent = await helper.createCheapAgent(projectId, 'Long Chat Agent', {
      systemPrompt: 'You are a helpful assistant. Remember everything the user tells you in this conversation. Be concise.',
    })

    const conv = await helper.createConversationViaApi(projectId, agent.id, 'Long Chat Test')

    // Send 10 numbered messages
    for (let i = 1; i <= 10; i++) {
      await helper.sendChatViaApi(
        projectId, agent.id, conv.id,
        `Message number ${i}: The secret word for message ${i} is "ALPHA${i}".`,
      )
    }

    // Ask about an earlier message
    const result = await helper.sendChatViaApi(
      projectId, agent.id, conv.id,
      'What was the secret word for message number 3? Reply with just the word.',
    )

    expect(result.response).toContain('ALPHA3')
  })

  test('error API key: chat returns error not crash', async ({ helper }) => {
    test.setTimeout(60_000)

    // Add a custom provider with a fake API key
    const settings = await helper.apiGet('/api/settings')
    await helper.apiPatch('/api/settings', {
      providers: {
        ...settings.providers,
        'e2e-fake-provider': {
          name: 'E2E Fake Provider',
          sdkType: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'sk-fake-invalid-key-for-e2e-testing',
          models: ['gpt-4o-mini'],
          testStatus: 'ok',
        },
      },
    })

    try {
      // Create agent using the fake provider
      const agent = await helper.createAgentViaApi(projectId, 'Fake Key Agent', {
        systemPrompt: 'Say hello.',
        model: { provider: 'e2e-fake-provider', model: 'gpt-4o-mini' },
      })

      const conv = await helper.createConversationViaApi(projectId, agent.id, 'Fake Key Test')

      // Try to chat — should fail with an error, not crash
      try {
        await helper.sendChatViaApi(
          projectId, agent.id, conv.id,
          'Hello.',
          30_000,
        )
        // If we get here, the API didn't throw — check if the response indicates an error
        // Some APIs return error in the SSE stream rather than throwing
      } catch (error: any) {
        // Expected: the chat should fail with an error (401/403/invalid key)
        // The important thing is it doesn't crash the server
        expect(error.message).toBeTruthy()
      }

      // Verify the server is still responsive after the error
      const healthCheck = await helper.apiGet('/api/settings')
      expect(healthCheck).toHaveProperty('providers')
    } finally {
      // Cleanup: remove the fake provider
      const currentSettings = await helper.apiGet('/api/settings')
      const { 'e2e-fake-provider': _, ...remainingProviders } = currentSettings.providers
      await helper.apiPatch('/api/settings', { providers: remainingProviders })
    }
  })
})
