/**
 * Test 1: Basic Sub-agent
 * - Define a sub-agent with only description + prompt + model
 * - Main agent receives instruction and spawns sub-agent
 * - Verify: sub-agent executes and returns result
 */
delete process.env.CLAUDECODE
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'

const TEST_NAME = 'Test 1: Basic Sub-agent'

export async function runTest1() {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`🧪 ${TEST_NAME}`)
  console.log(`${'='.repeat(60)}`)

  const cwd = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

  const stream = query({
    prompt: `You have a sub-agent called "summarizer". Use the Task tool to spawn it with the prompt: "Summarize what 2+2 equals in one sentence." Then report the result back to me. Be concise.`,
    options: {
      model: 'claude-sonnet-4-6',
      maxTurns: 10,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      cwd,
      agents: {
        summarizer: {
          description: 'A summarization agent that provides concise summaries',
          prompt: 'You are a concise summarizer. When given a topic, provide a one-sentence summary. Do not use any tools, just respond with text.',
          model: 'haiku',
        },
      },
    },
  })

  let sawTaskStarted = false
  let sawTaskNotification = false
  let resultText = ''
  let success = false

  for await (const message of stream) {
    logMessage(message)

    if (message.type === 'system' && message.subtype === 'init') {
      console.log(`  📋 Available agents: ${message.agents?.join(', ') ?? 'none'}`)
      console.log(`  🔧 Available tools: ${message.tools.join(', ')}`)
    }

    if (message.type === 'system' && message.subtype === 'task_started') {
      sawTaskStarted = true
      console.log(`  🚀 Task started: ${message.description}`)
    }

    if (message.type === 'system' && message.subtype === 'task_notification') {
      sawTaskNotification = true
      console.log(`  📨 Task notification: status=${message.status}, summary=${message.summary}`)
    }

    if (message.type === 'result') {
      resultText = message.subtype === 'success' ? message.result : ''
      success = message.subtype === 'success' && !message.is_error
      console.log(`  📊 Result: success=${success}, cost=$${message.total_cost_usd?.toFixed(4)}`)
    }
  }

  // Note: task_notification is only emitted for background/async tasks.
  // For synchronous awaited tasks, task_started + result success is sufficient.
  const passed = success && sawTaskStarted
  console.log(`\n  ${passed ? '✅ PASS' : '❌ FAIL'}: ${TEST_NAME}`)
  console.log(`    - Task started: ${sawTaskStarted}`)
  console.log(`    - Task notification received: ${sawTaskNotification} (optional for sync tasks)`)
  console.log(`    - Result success: ${success}`)

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
    case 'system':
      if (msg.subtype === 'init') break // handled above
      if (msg.subtype === 'task_started' || msg.subtype === 'task_notification' || msg.subtype === 'task_progress') break // handled above
      break
  }
}

// Allow running standalone
if (import.meta.url === `file://${process.argv[1]}`) {
  runTest1().then((passed) => process.exit(passed ? 0 : 1))
}
