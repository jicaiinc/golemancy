/**
 * Test 6: Sub-agent Nesting (Expected to Fail)
 * - Define two-level sub-agents: main → agent-a → agent-b
 * - agent-a's tools include "Task"
 * - Verify: agent-a CANNOT spawn agent-b (Task tool is filtered by iP6)
 *
 * This test validates the known SDK limitation: sub-agents cannot nest.
 */
delete process.env.CLAUDECODE
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'

const TEST_NAME = 'Test 6: Sub-agent Nesting (Expected: Task tool filtered)'

export async function runTest6() {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`🧪 ${TEST_NAME}`)
  console.log(`${'='.repeat(60)}`)

  const cwd = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

  const stream = query({
    prompt: `You have a sub-agent called "agent-a". Use the Task tool to spawn it with this prompt: "You have a sub-agent called agent-b. Try to use the Task tool to spawn agent-b with the prompt 'Say hello'. If you cannot find the Task tool, report that the Task tool is not available to you. List your available tools." Report what agent-a says.`,
    options: {
      model: 'claude-sonnet-4-6',
      maxTurns: 15,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      cwd,
      agents: {
        'agent-a': {
          description: 'An intermediate agent that should try to spawn agent-b',
          prompt: 'You are agent-a. If asked to spawn a sub-agent, try to use the Task tool. If the Task tool is not available, clearly state "Task tool is NOT available" and list what tools you do have.',
          model: 'haiku',
          // Explicitly request Task tool - but it should be filtered by CLI runtime
          tools: ['Read', 'Glob', 'Bash', 'Task'],
        },
        'agent-b': {
          description: 'A nested agent (should not be reachable)',
          prompt: 'You are agent-b. Say hello.',
          model: 'haiku',
        },
      },
    },
  })

  let sawTaskStarted = false
  let taskStartCount = 0
  let sawTaskNotification = false
  let resultText = ''
  let success = false

  for await (const message of stream) {
    logMessage(message)

    if (message.type === 'system' && message.subtype === 'init') {
      console.log(`  📋 Available agents: ${message.agents?.join(', ') ?? 'none'}`)
    }

    if (message.type === 'system' && message.subtype === 'task_started') {
      taskStartCount++
      sawTaskStarted = true
      console.log(`  🚀 Task started (#${taskStartCount}): ${message.description}`)
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

  // We expect only ONE task_started (main → agent-a), not two (no agent-a → agent-b)
  // agent-a should report that Task tool is not available
  const nestingBlocked = taskStartCount === 1
  const taskToolFiltered =
    resultText.toLowerCase().includes('not available') ||
    resultText.toLowerCase().includes('cannot') ||
    resultText.toLowerCase().includes("don't have") ||
    resultText.toLowerCase().includes('no task tool') ||
    resultText.toLowerCase().includes('does not have')

  const passed = success && sawTaskStarted && nestingBlocked
  console.log(`\n  ${passed ? '✅ PASS' : '❌ FAIL'}: ${TEST_NAME}`)
  console.log(`    - Task started count: ${taskStartCount} (expected: 1, nesting blocked: ${nestingBlocked})`)
  console.log(`    - Task tool reported as filtered: ${taskToolFiltered}`)
  console.log(`    - Result success: ${success}`)
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
  runTest6().then((passed) => process.exit(passed ? 0 : 1))
}
