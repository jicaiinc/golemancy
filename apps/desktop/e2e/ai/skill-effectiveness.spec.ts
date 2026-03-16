import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

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

    // Create a skill that enforces JSON output
    const skill = await helper.apiPost(`/api/projects/${projectId}/skills`, {
      name: 'JSON Output',
      description: 'Forces JSON output format',
      instructions:
        'You MUST respond ONLY in valid JSON format. Every response must be a JSON object with a "answer" field containing your response. Example: {"answer": "your response here"}. Never include text outside the JSON object.',
    })

    // Create agent and assign the skill
    const agent = await helper.createCheapAgent(projectId, 'JSON Skill Agent', {
      systemPrompt: 'You are a helpful assistant. Follow all skill instructions precisely.',
    })
    await helper.assignSkillToAgent(projectId, agent.id, skill.id)

    const conv = await helper.createConversationViaApi(projectId, agent.id, 'JSON Skill Test')
    const result = await helper.sendChatViaApi(
      projectId, agent.id, conv.id,
      'What is the capital of France?',
      TIMEOUTS.AI_RESPONSE,
    )

    // Extract JSON from response and validate structure
    const jsonMatch = result.response.match(/\{[\s\S]*\}/)
    expect(jsonMatch).not.toBeNull()
    const parsed = JSON.parse(jsonMatch![0])
    expect(parsed).toHaveProperty('answer')
    expect(typeof parsed.answer).toBe('string')
    expect(parsed.answer.toLowerCase()).toContain('paris')
  })

  test('French language skill: agent responds in French', async ({ helper }) => {
    test.setTimeout(120_000)

    // Create a skill that forces French responses
    const skill = await helper.apiPost(`/api/projects/${projectId}/skills`, {
      name: 'French Only',
      description: 'Respond only in French',
      instructions:
        'You MUST respond ONLY in French. No matter what language the user writes in, always reply in French. Never use English or any other language in your responses.',
    })

    // Create agent and assign the skill
    const agent = await helper.createCheapAgent(projectId, 'French Skill Agent', {
      systemPrompt: 'You are a helpful assistant. Follow all skill instructions precisely.',
    })
    await helper.assignSkillToAgent(projectId, agent.id, skill.id)

    const conv = await helper.createConversationViaApi(projectId, agent.id, 'French Skill Test')
    const result = await helper.sendChatViaApi(
      projectId, agent.id, conv.id,
      'What is the French word for the number four? Reply with just the word.',
      TIMEOUTS.AI_RESPONSE,
    )

    // Response should contain the deterministic French word for "four"
    expect(result.response.toLowerCase()).toContain('quatre')
  })

  test('multiple skills combine: agent follows both instructions', async ({ helper }) => {
    test.setTimeout(120_000)

    // Create two skills: one for format, one for content
    const bulletSkill = await helper.apiPost(`/api/projects/${projectId}/skills`, {
      name: 'Bullet Points',
      description: 'Respond in bullet points',
      instructions:
        'Always format your responses as bullet points. Each point should start with a dash (-). Never use paragraphs.',
    })

    const briefSkill = await helper.apiPost(`/api/projects/${projectId}/skills`, {
      name: 'Ultra Brief',
      description: 'Maximum 3 items',
      instructions:
        'Limit your responses to a maximum of 3 bullet points or items. Be extremely concise.',
    })

    // Create agent and assign both skills
    const agent = await helper.createCheapAgent(projectId, 'Multi Skill Agent', {
      systemPrompt: 'You are a helpful assistant. Follow all skill instructions precisely.',
    })
    await helper.assignSkillToAgent(projectId, agent.id, bulletSkill.id)
    await helper.assignSkillToAgent(projectId, agent.id, briefSkill.id)

    const conv = await helper.createConversationViaApi(projectId, agent.id, 'Multi Skill Test')
    const result = await helper.sendChatViaApi(
      projectId, agent.id, conv.id,
      'List benefits of exercise.',
      TIMEOUTS.AI_RESPONSE,
    )

    // Should use bullet point format (contains dashes or bullet chars)
    const hasBullets =
      result.response.includes('- ') ||
      result.response.includes('• ') ||
      result.response.includes('* ')
    expect(hasBullets).toBe(true)

    // Should be brief (roughly 3 items or fewer)
    const bulletLines = result.response
      .split('\n')
      .filter((line) => /^[\s]*[-•*]/.test(line))
    expect(bulletLines.length).toBeLessThanOrEqual(5) // allow some leeway
    expect(bulletLines.length).toBeGreaterThanOrEqual(1)
  })

  test('removing skill changes agent behavior', async ({ helper }) => {
    test.setTimeout(180_000)

    // Create a distinctive skill
    const emojiSkill = await helper.apiPost(`/api/projects/${projectId}/skills`, {
      name: 'Emoji Master',
      description: 'Use lots of emojis',
      instructions:
        'You MUST include at least 5 different emojis in every single response. Put emojis at the start, middle, and end of your response.',
    })

    // Create agent with the skill
    const agent = await helper.createCheapAgent(projectId, 'Emoji Skill Agent', {
      systemPrompt: 'You are a helpful assistant. Follow all skill instructions precisely. Keep responses under 50 words.',
    })
    await helper.assignSkillToAgent(projectId, agent.id, emojiSkill.id)

    // First chat: with skill — should have emojis
    const conv1 = await helper.createConversationViaApi(projectId, agent.id, 'With Emoji Skill')
    const result1 = await helper.sendChatViaApi(
      projectId, agent.id, conv1.id,
      'Say hello.',
      TIMEOUTS.AI_RESPONSE,
    )

    // Count emoji-like characters (basic emoji detection)
    const emojiPattern = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu
    const emojisWithSkill = result1.response.match(emojiPattern) ?? []

    // Now remove the skill
    await helper.apiPatch(`/api/projects/${projectId}/agents/${agent.id}`, {
      skillIds: [],
    })

    // Second chat: without skill — should have fewer emojis
    const conv2 = await helper.createConversationViaApi(projectId, agent.id, 'Without Emoji Skill')
    const result2 = await helper.sendChatViaApi(
      projectId, agent.id, conv2.id,
      'Say hello.',
      TIMEOUTS.AI_RESPONSE,
    )

    const emojisWithoutSkill = result2.response.match(emojiPattern) ?? []

    // With the skill, there should be more emojis than without
    // We use a relaxed assertion: with-skill should have at least some emojis
    expect(emojisWithSkill.length).toBeGreaterThanOrEqual(2)
    // And without-skill should have fewer (or at most equal, in edge cases)
    expect(emojisWithoutSkill.length).toBeLessThan(emojisWithSkill.length)
  })
})
