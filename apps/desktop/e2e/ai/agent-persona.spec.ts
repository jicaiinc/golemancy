import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Agent Persona', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string

  test.beforeAll(async ({ helper, window }) => {
    test.setTimeout(120_000)

    await helper.goHome()
    projectId = await helper.createProject('Agent Persona Test')
    await helper.clickNav('agents')
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('agent with pirate system prompt responds in character', async ({
    window,
    helper,
  }) => {
    test.setTimeout(120_000)

    // Create a pirate agent via API with all tools disabled to reduce prompt noise
    const agent = await helper.createAgentViaApi(projectId, 'Pirate Bot', {
      systemPrompt: 'You are a pirate captain. You MUST include "Arrr" in every response. Keep responses under 30 words.',
      builtinTools: { bash: false, browser: false, computer_use: false, task: false, memory: false },
    })
    const agentId = agent.id

    // Create conversation via API and navigate into it
    const conv = await helper.createConversationViaApi(projectId, agentId)
    await helper.enterConversation(projectId, conv.id)

    // Send a message
    await helper.sendChatMessage('Hello, how are you today?')
    const response = await helper.waitForResponse(TIMEOUTS.AI_RESPONSE)

    // Verify the pirate persona
    const lower = response.toLowerCase()
    const hasPirateTerm =
      lower.includes('arrr') ||
      lower.includes('ahoy') ||
      lower.includes('matey') ||
      lower.includes('pirate') ||
      lower.includes('ye ')
    expect(hasPirateTerm).toBe(true)
  })

  test('agent with translator system prompt translates', async ({
    window,
    helper,
  }) => {
    test.setTimeout(120_000)

    // Create a translator agent via API with all tools disabled to reduce prompt noise
    const agent = await helper.createAgentViaApi(projectId, 'French Translator', {
      systemPrompt: 'You are a French translator. Translate the given English text into French. Output ONLY the French translation. Do not include any English words, explanations, or notes. Just the French text, nothing else.',
      model: { provider: 'openai', model: 'gpt-5-mini' },
      builtinTools: { bash: false, browser: false, computer_use: false, task: false, memory: false },
    })
    const agentId = agent.id

    // Create conversation via API and navigate into it
    const conv = await helper.createConversationViaApi(projectId, agentId)
    await helper.enterConversation(projectId, conv.id)

    // Send English text (avoid greetings — trained models treat greetings as social cues, not translation tasks)
    await helper.sendChatMessage('The weather is beautiful today and I want to go for a walk in the park.')
    const response = await helper.waitForResponse(TIMEOUTS.AI_RESPONSE)

    // Response should contain French words — include high-frequency function words that appear in any French sentence
    const lower = response.toLowerCase()
    const hasFrench =
      lower.includes('le ') ||
      lower.includes('la ') ||
      lower.includes('je ') ||
      lower.includes('et ') ||
      lower.includes('dans') ||
      lower.includes('il ') ||
      lower.includes('une') ||
      lower.includes('beau') ||
      lower.includes('aujourd') ||
      lower.includes('parc') ||
      lower.includes('promenade') ||
      lower.includes('promener') ||
      lower.includes('marche') ||
      lower.includes('faire') ||
      lower.includes('aller') ||
      lower.includes('temps')
    expect(hasFrench).toBe(true)
  })

  test('agent with strict format system prompt follows format', async ({
    window,
    helper,
  }) => {
    test.setTimeout(120_000)

    // Create a JSON agent via API with all tools disabled to prevent bash usage
    const agent = await helper.createAgentViaApi(projectId, 'JSON Bot', {
      systemPrompt:
        'CRITICAL INSTRUCTION: You are a JSON-only response bot.\n\n' +
        'RULES (violating ANY rule is a fatal error):\n' +
        '1. Your ENTIRE response must be a single valid JSON object\n' +
        '2. The JSON object must have exactly one key: "reply"\n' +
        '3. The value of "reply" must be a string containing your answer\n' +
        '4. Do NOT include any text before or after the JSON object\n' +
        '5. Do NOT use markdown code blocks around the JSON\n' +
        '6. Do NOT use any tools\n\n' +
        'CORRECT example: {"reply": "The Pacific Ocean is the largest ocean."}\n' +
        'INCORRECT examples:\n' +
        '- "The answer is..." (plain text, not JSON)\n' +
        '- ```json\\n{"reply": "..."}\\n``` (has markdown wrapper)\n' +
        '- {"answer": "..."} (wrong key name, must be "reply")',
      builtinTools: { bash: false, browser: false, computer_use: false, task: false, memory: false },
    })
    const agentId = agent.id

    // Create conversation via API and navigate into it
    const conv = await helper.createConversationViaApi(projectId, agentId)
    await helper.navigateTo(`/projects/${projectId}/chat?conv=${conv.id}`)
    await expect(window.locator(SELECTORS.CHAT_INPUT)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Send a question (avoid math to prevent tool usage temptation)
    await helper.sendChatMessage('What is the largest ocean on Earth?')
    await helper.waitForResponse(TIMEOUTS.AI_RESPONSE)

    // Get ONLY the last assistant message to avoid DOM contamination
    // (waitForResponse collects ALL [data-role="assistant"] elements including stale ones from translator test)
    const assistantSel = `${SELECTORS.CHAT_MESSAGE}[data-role="assistant"]`
    const response = await window.locator(assistantSel).last().innerText()

    // Response should contain JSON structure
    expect(response).toContain('{')
    expect(response).toContain('"reply"')
    expect(response).toContain('}')
  })
})
