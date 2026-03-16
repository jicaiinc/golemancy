import { test, expect } from '../fixtures'

test.describe('Browser Tool Config — builtinTools Validation', () => {
  let projectId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()

    const project = await helper.createProjectViaApi('Browser Tool Config Test')
    projectId = project.id
  })

  test('POST agent gets default builtinTools with bash:true', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/agents`, {
      name: 'Default Agent',
      systemPrompt: 'Agent with default tools.',
    })
    expect(response.status()).toBe(201)
    const agent = await response.json()
    expect(agent.id).toBeDefined()

    // Server defaults to { bash: true } on creation
    const fetched = await helper.apiGet(`/api/projects/${projectId}/agents/${agent.id}`)
    expect(fetched.builtinTools).toBeDefined()
    expect(fetched.builtinTools.bash).toBe(true)
  })

  test('PATCH agent builtinTools.browser: true persists correctly', async ({ helper }) => {
    // Create agent (gets default builtinTools)
    const agent = await helper.apiPost(`/api/projects/${projectId}/agents`, {
      name: 'Browser Agent',
      systemPrompt: 'Agent with browser tool enabled.',
    })

    // PATCH to enable browser
    await helper.apiPatch(`/api/projects/${projectId}/agents/${agent.id}`, {
      builtinTools: { ...agent.builtinTools, browser: true },
    })

    const fetched = await helper.apiGet(`/api/projects/${projectId}/agents/${agent.id}`)
    expect(fetched.builtinTools.browser).toBe(true)
    expect(fetched.builtinTools.bash).toBe(true)
  })

  test('PATCH agent with all builtinTools preserves all fields', async ({ helper }) => {
    const agent = await helper.apiPost(`/api/projects/${projectId}/agents`, {
      name: 'All Tools Agent',
    })

    // PATCH to set all builtinTools
    await helper.apiPatch(`/api/projects/${projectId}/agents/${agent.id}`, {
      builtinTools: {
        bash: true,
        browser: true,
        computer_use: false,
        task: true,
        memory: true,
      },
    })

    const fetched = await helper.apiGet(`/api/projects/${projectId}/agents/${agent.id}`)
    expect(fetched.builtinTools.bash).toBe(true)
    expect(fetched.builtinTools.browser).toBe(true)
    expect(fetched.builtinTools.computer_use).toBe(false)
    expect(fetched.builtinTools.task).toBe(true)
    expect(fetched.builtinTools.memory).toBe(true)
  })

  test('PATCH agent can toggle builtinTools.browser', async ({ helper }) => {
    const agent = await helper.apiPost(`/api/projects/${projectId}/agents`, {
      name: 'Toggle Agent',
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
