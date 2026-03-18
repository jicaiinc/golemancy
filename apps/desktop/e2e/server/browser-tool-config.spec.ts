import { test, expect } from '../fixtures'

test.describe('Browser Tool Config — builtinTools Validation', () => {
  let projectId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()

    const project = await helper.createProjectViaApi('Browser Tool Config Test')
    projectId = project.id
  })

  test('POST agent with builtinTools.browser: true persists correctly', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/agents`, {
      name: 'Browser Agent',
      systemPrompt: 'Agent with browser tool enabled.',
      builtinTools: { browser: true },
    })
    expect(response.status()).toBe(201)
    const agent = await response.json()
    expect(agent.id).toBeDefined()

    // GET the agent and verify builtinTools.browser is true
    const fetched = await helper.apiGet(`/api/projects/${projectId}/agents/${agent.id}`)
    expect(fetched.builtinTools.browser).toBe(true)
  })

  test('POST agent with explicit builtinTools preserves all fields', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/agents`, {
      name: 'All Tools Agent',
      builtinTools: {
        bash: true,
        browser: true,
        computer_use: false,
        task: true,
        memory: true,
      },
    })
    expect(response.status()).toBe(201)
    const agent = await response.json()

    const fetched = await helper.apiGet(`/api/projects/${projectId}/agents/${agent.id}`)
    expect(fetched.builtinTools.bash).toBe(true)
    expect(fetched.builtinTools.browser).toBe(true)
    expect(fetched.builtinTools.computer_use).toBe(false)
    expect(fetched.builtinTools.task).toBe(true)
    expect(fetched.builtinTools.memory).toBe(true)
  })

  test('POST agent without builtinTools gets storage defaults (bash only)', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/agents`, {
      name: 'Default Tools Agent',
      systemPrompt: 'Agent with default tools.',
    })
    expect(response.status()).toBe(201)
    const agent = await response.json()

    const fetched = await helper.apiGet(`/api/projects/${projectId}/agents/${agent.id}`)
    // Default stored value is only { bash: true }; task/memory/browser/computer_use
    // are not persisted unless explicitly set (runtime fills them via BUILTIN_TOOL_DEFAULTS)
    expect(fetched.builtinTools.bash).toBe(true)
    expect(fetched.builtinTools.task).toBeUndefined()
    expect(fetched.builtinTools.memory).toBeUndefined()
    expect(fetched.builtinTools.browser).toBeUndefined()
    expect(fetched.builtinTools.computer_use).toBeUndefined()
  })

  test('PATCH agent can toggle builtinTools.browser', async ({ helper }) => {
    // Create agent with browser off
    const agent = await helper.apiPost(`/api/projects/${projectId}/agents`, {
      name: 'Toggle Agent',
      builtinTools: { browser: false },
    })

    // Toggle browser on
    await helper.apiPatch(`/api/projects/${projectId}/agents/${agent.id}`, {
      builtinTools: { ...agent.builtinTools, browser: true },
    })

    const fetched = await helper.apiGet(`/api/projects/${projectId}/agents/${agent.id}`)
    expect(fetched.builtinTools.browser).toBe(true)

    // Toggle browser off again
    await helper.apiPatch(`/api/projects/${projectId}/agents/${agent.id}`, {
      builtinTools: { ...fetched.builtinTools, browser: false },
    })

    const refetched = await helper.apiGet(`/api/projects/${projectId}/agents/${agent.id}`)
    expect(refetched.builtinTools.browser).toBe(false)
  })
})
