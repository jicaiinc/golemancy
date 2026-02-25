/**
 * Test 3: Sub-agent + Skills
 *
 * SETUP: Skill file at PROJECT_ROOT/.claude/skills/sdk-test-reviewer/SKILL.md
 * (Not _test-agent-sdk/.claude/ — SDK discovers skills relative to git root)
 *
 * Sub-agent references via skills: ["sdk-test-reviewer"]
 * settingSources: ["project"] enables project-level skill discovery
 *
 * Verify: sub-agent has loaded the skill content by checking for the
 * exact phrase from SKILL.md: "I am using the sdk-test-reviewer skill."
 */
delete process.env.CLAUDECODE
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'

const TEST_NAME = 'Test 3: Sub-agent + Per-agent Skills'

export async function runTest3() {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`🧪 ${TEST_NAME}`)
  console.log(`${'='.repeat(60)}`)

  const cwd = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
  console.log(`  📂 CWD: ${cwd}`)

  const stderrLines: string[] = []

  async function* generateMessages() {
    yield {
      type: 'user' as const,
      message: {
        role: 'user' as const,
        content: `Use the Task tool to spawn the "reviewer" sub-agent with this exact prompt: "What skill are you using? You MUST answer by stating the exact name as instructed in your skill." Then report the sub-agent's exact response.`,
      },
      session_id: '',
      parent_tool_use_id: null,
    }
  }

  const stream = query({
    prompt: generateMessages(),
    options: {
      model: 'claude-sonnet-4-6',
      maxTurns: 10,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      cwd,
      settingSources: ['project'],
      stderr: (data: string) => {
        const line = data.trim()
        if (line) {
          stderrLines.push(line)
          if (line.toLowerCase().includes('skill')) {
            console.log(`  [stderr:skill] ${line}`)
          }
        }
      },
      agents: {
        reviewer: {
          description: 'A code reviewer agent with the sdk-test-reviewer skill loaded',
          prompt: 'You are a code reviewer. Follow all instructions from your loaded skills. When asked about your skill, follow the IMPORTANT instruction from your skill content exactly.',
          model: 'haiku',
          skills: ['sdk-test-reviewer'],
        },
      },
    },
  })

  let sawTaskStarted = false
  let resultText = ''
  let success = false

  for await (const message of stream) {
    logMessage(message)

    if (message.type === 'system' && message.subtype === 'init') {
      console.log(`  📋 Available agents: ${message.agents?.join(', ') ?? 'none'}`)
      console.log(`  📚 Main agent skills: ${message.skills?.join(', ') ?? 'none'}`)
    }

    if (message.type === 'system' && message.subtype === 'task_started') {
      sawTaskStarted = true
      console.log(`  🚀 Task started: ${message.description}`)
    }

    if (message.type === 'system' && message.subtype === 'task_notification') {
      console.log(`  📨 Task notification: status=${message.status}, summary=${message.summary}`)
    }

    if (message.type === 'result') {
      resultText = message.subtype === 'success' ? message.result : ''
      success = message.subtype === 'success' && !message.is_error
      console.log(`  📊 Result: success=${success}, cost=$${message.total_cost_usd?.toFixed(4)}`)
    }
  }

  // Check if the result contains evidence the skill was ACTUALLY loaded into the sub-agent
  // The SKILL.md says: "respond with exactly: 'I am using the sdk-test-reviewer skill.'"
  // If sub-agent says "don't have a skill" or "no skill loaded", the skill was NOT injected.
  const subAgentDeniedSkill =
    resultText.toLowerCase().includes("don't currently have a skill") ||
    resultText.toLowerCase().includes('no skill loaded') ||
    resultText.toLowerCase().includes('not currently using any skill') ||
    resultText.toLowerCase().includes('not available')

  const exactPhraseFound = resultText.includes('I am using the sdk-test-reviewer skill')
  // Looser check: the SKILL.md content contains review format instructions
  const skillContentEvidence =
    exactPhraseFound || (resultText.toLowerCase().includes('sdk-test-reviewer') && !subAgentDeniedSkill)

  // Show stderr hints about skill loading
  const skillStderr = stderrLines.filter((l) => l.toLowerCase().includes('skill'))
  if (skillStderr.length > 0) {
    console.log(`  📝 Skill-related stderr (${skillStderr.length} lines):`)
    skillStderr.slice(0, 5).forEach((l) => console.log(`    ${l}`))
  }

  const passed = success && sawTaskStarted && skillContentEvidence
  console.log(`\n  ${passed ? '✅ PASS' : '❌ FAIL'}: ${TEST_NAME}`)
  console.log(`    - Task started: ${sawTaskStarted}`)
  console.log(`    - Result success: ${success}`)
  console.log(`    - Skill name in result: ${exactPhraseFound}`)
  console.log(`    - Skill content evidence: ${skillContentEvidence}`)
  if (resultText) {
    console.log(`    - Result text: ${resultText.slice(0, 500)}`)
  }

  return passed
}

function logMessage(msg: SDKMessage) {
  switch (msg.type) {
    case 'assistant':
      if (msg.message?.content) {
        for (const block of msg.message.content) {
          if ('text' in block && block.text) {
            console.log(`  💬 Assistant: ${block.text.slice(0, 200)}${block.text.length > 200 ? '...' : ''}`)
          }
          if ('type' in block && block.type === 'tool_use') {
            console.log(`  🔧 Tool call: ${block.name}(${JSON.stringify(block.input).slice(0, 100)})`)
          }
        }
      }
      break
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTest3().then((passed) => process.exit(passed ? 0 : 1))
}
