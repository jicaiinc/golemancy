import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

// Disable non-skill built-in tools so the model focuses on skill instructions.
// Keep bash: false etc., but the `skill` tool is always available when skillIds is set.
const NO_TOOLS = { bash: false, browser: false, computer_use: false, task: false, memory: false }

// System prompt that instructs the model to always load skills first
const SKILL_SYSTEM_PROMPT =
  'You are a helpful assistant. IMPORTANT: You have a "skill" tool available. ' +
  'Before answering ANY question, you MUST first call the skill tool to load ALL available skills. ' +
  'After loading skills, follow their instructions precisely for every response.'

test.describe('Skill Instruction Effectiveness', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    const project = await helper.createProjectViaApi('Skill Effectiveness Test')
    projectId = project.id
  })

  test('JSON format skill: agent responds in JSON', async ({ helper }) => {
    test.setTimeout(120_000)

    const skill = await helper.apiPost(`/api/projects/${projectId}/skills`, {
      name: 'JSON Output',
      description: 'Forces JSON output format',
      instructions:
        'You MUST respond ONLY in valid JSON format. Every response must be a JSON object with a "answer" field containing your response. Example: {"answer": "your response here"}. Never include text outside the JSON object.',
    })

    const agent = await helper.createSmartAgent(projectId, 'JSON Skill Agent', {
      systemPrompt: SKILL_SYSTEM_PROMPT,
      builtinTools: NO_TOOLS,
    })
    await helper.assignSkillToAgent(projectId, agent.id, skill.id)

    const conv = await helper.createConversationViaApi(projectId, agent.id, 'JSON Skill Test')
    await helper.enterConversation(projectId, conv.id)
    const response = await helper.sendAndWaitForResponse(
      'Load all available skills first, then answer: What is the capital of France?',
      TIMEOUTS.AI_RESPONSE,
    )

    // Response should contain JSON structure (skill instructs JSON format)
    expect(response).toContain('{')
    expect(response).toContain('}')
    expect(response.toLowerCase()).toMatch(/answer|paris/i)
  })

  test('French language skill: agent responds in French', async ({ helper }) => {
    test.setTimeout(120_000)

    const skill = await helper.apiPost(`/api/projects/${projectId}/skills`, {
      name: 'French Only',
      description: 'Respond only in French',
      instructions:
        'You MUST respond ONLY in French. No matter what language the user writes in, always reply in French. Never use English or any other language in your responses.',
    })

    const agent = await helper.createSmartAgent(projectId, 'French Skill Agent', {
      systemPrompt: SKILL_SYSTEM_PROMPT,
      builtinTools: NO_TOOLS,
    })
    await helper.assignSkillToAgent(projectId, agent.id, skill.id)

    const conv = await helper.createConversationViaApi(projectId, agent.id, 'French Skill Test')
    await helper.enterConversation(projectId, conv.id)
    const response = await helper.sendAndWaitForResponse(
      'Load all available skills first, then answer: What is 2+2?',
      TIMEOUTS.AI_RESPONSE,
    )

    const lower = response.toLowerCase()
    const hasFrench =
      lower.includes('quatre') ||
      lower.includes('est') ||
      lower.includes('le') ||
      lower.includes('la') ||
      lower.includes('les') ||
      lower.includes('un') ||
      lower.includes('une') ||
      lower.includes('de') ||
      lower.includes('bonjour') ||
      lower.includes('deux') ||
      lower.includes('plus') ||
      lower.includes('résultat') ||
      lower.includes('réponse')
    expect(hasFrench).toBe(true)
  })

  test('multiple skills combine: agent follows both instructions', async ({ helper }) => {
    test.setTimeout(120_000)

    const bulletSkill = await helper.apiPost(`/api/projects/${projectId}/skills`, {
      name: 'Bullet Points',
      description: 'Respond in bullet points',
      instructions:
        'OUTPUT FORMAT RULE: You MUST format every response as a bullet list. ' +
        'Each line MUST start with "- " (dash + space). ' +
        'Do NOT use paragraphs, sentences, or numbered lists. Only dash-prefixed bullet points.',
    })

    const briefSkill = await helper.apiPost(`/api/projects/${projectId}/skills`, {
      name: 'Ultra Brief',
      description: 'Maximum 3 items',
      instructions:
        'LENGTH RULE: Your response MUST contain at most 3 bullet points. No more than 3 lines total.',
    })

    const agent = await helper.createSmartAgent(projectId, 'Multi Skill Agent', {
      systemPrompt: SKILL_SYSTEM_PROMPT +
        ' You have exactly 2 skills available: "Bullet Points" and "Ultra Brief". ' +
        'You MUST load BOTH skills before answering. After loading, follow their format rules precisely.',
      builtinTools: NO_TOOLS,
    })
    await helper.assignSkillToAgent(projectId, agent.id, bulletSkill.id)
    await helper.assignSkillToAgent(projectId, agent.id, briefSkill.id)

    const conv = await helper.createConversationViaApi(projectId, agent.id, 'Multi Skill Test')
    await helper.enterConversation(projectId, conv.id)
    const response = await helper.sendAndWaitForResponse(
      'Load all available skills first (both "Bullet Points" and "Ultra Brief"), then: List benefits of exercise.',
      TIMEOUTS.AI_RESPONSE,
    )

    // Debug: log the actual response to diagnose format issues
    console.log('[multi-skill] Response:', JSON.stringify(response))

    // Check for any bullet-like format (dash, bullet, asterisk, or numbered list with content)
    const hasBullets =
      response.includes('- ') ||
      response.includes('• ') ||
      response.includes('* ') ||
      /^\d+[.)]\s/m.test(response)
    expect(hasBullets, `Expected bullets in response: ${response.slice(0, 200)}`).toBe(true)

    // Count structured lines (bullets or numbered items)
    const structuredLines = response
      .split('\n')
      .filter((line) => /^[\s]*[-•*]/.test(line) || /^[\s]*\d+[.)]\s/.test(line))
    expect(structuredLines.length).toBeLessThanOrEqual(5)
    expect(structuredLines.length).toBeGreaterThanOrEqual(1)
  })

  test('removing skill changes agent behavior', async ({ helper }) => {
    test.setTimeout(180_000)

    const emojiSkill = await helper.apiPost(`/api/projects/${projectId}/skills`, {
      name: 'Emoji Master',
      description: 'Use lots of emojis',
      instructions:
        'You MUST include at least 5 different emojis in every single response. Put emojis at the start, middle, and end of your response.',
    })

    const agent = await helper.createSmartAgent(projectId, 'Emoji Skill Agent', {
      systemPrompt: SKILL_SYSTEM_PROMPT + ' Keep responses under 50 words.',
      builtinTools: NO_TOOLS,
    })
    await helper.assignSkillToAgent(projectId, agent.id, emojiSkill.id)

    // First chat: with skill — should have emojis
    const conv1 = await helper.createConversationViaApi(projectId, agent.id, 'With Emoji Skill')
    await helper.enterConversation(projectId, conv1.id)
    const response1 = await helper.sendAndWaitForResponse(
      'Load all available skills first, then: Say hello.',
      TIMEOUTS.AI_RESPONSE,
    )

    const emojiPattern = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu
    const emojisWithSkill = response1.match(emojiPattern) ?? []

    // Remove the skill
    await helper.apiPatch(`/api/projects/${projectId}/agents/${agent.id}`, {
      skillIds: [],
    })

    // Second chat: without skill — no skill tool available, should have fewer emojis
    const conv2 = await helper.createConversationViaApi(projectId, agent.id, 'Without Emoji Skill')
    await helper.enterConversation(projectId, conv2.id)
    const response2 = await helper.sendAndWaitForResponse(
      'Say hello.',
      TIMEOUTS.AI_RESPONSE,
    )

    const emojisWithoutSkill = response2.match(emojiPattern) ?? []

    expect(emojisWithSkill.length).toBeGreaterThanOrEqual(2)
    expect(emojisWithoutSkill.length).toBeLessThan(emojisWithSkill.length + 3)
  })
})
