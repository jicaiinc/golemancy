/**
 * Test 5: Sub-agent + Tool Restrictions
 * - Define sub-agent with tools: ["Read", "Glob"] (whitelist)
 * - Define disallowedTools: ["Bash"] (blacklist)
 * - Ask sub-agent to try using restricted tools
 * - Verify: sub-agent can only use whitelisted tools
 */
delete process.env.CLAUDECODE
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'

const TEST_NAME = 'Test 5: Sub-agent + Tool Restrictions'

export async function runTest5() {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`🧪 ${TEST_NAME}`)
  console.log(`${'='.repeat(60)}`)

  const cwd = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

  const stream = query({
    prompt: `You have a sub-agent called "reader" that can ONLY use Read and Glob tools (Bash is explicitly disallowed). Use the Task tool to spawn it with this prompt: "Read the file package.json in the current directory and report its name field. Do NOT attempt to use Bash." Then report the result.`,
    options: {
      model: 'claude-sonnet-4-6',
      maxTurns: 15,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      cwd,
      agents: {
        reader: {
          description: 'A read-only agent that can only read files and glob patterns',
          prompt: 'You are a read-only agent. You can only read files and search for file patterns. Never attempt to write, edit, or execute commands.',
          model: 'haiku',
          tools: ['Read', 'Glob'],
          disallowedTools: ['Bash', 'Write', 'Edit'],
        },
      },
    },
  })

  let sawTaskStarted = false
  let sawTaskNotification = false
  let subAgentTools: string[] = []
  let resultText = ''
  let success = false

  for await (const message of stream) {
    logMessage(message)

    if (message.type === 'system' && message.subtype === 'init') {
      console.log(`  📋 Available agents: ${message.agents?.join(', ') ?? 'none'}`)
      console.log(`  🔧 Main agent tools: ${message.tools.join(', ')}`)
    }

    if (message.type === 'system' && message.subtype === 'task_started') {
      sawTaskStarted = true
      console.log(`  🚀 Task started: ${message.description}`)
    }

    if (message.type === 'system' && message.subtype === 'task_notification') {
      sawTaskNotification = true
      console.log(`  📨 Task notification: status=${message.status}, summary=${message.summary}`)
    }

    // Track tool usage in sub-agent via tool_progress messages
    if (message.type === 'tool_progress' && message.task_id) {
      subAgentTools.push(message.tool_name)
    }

    if (message.type === 'result') {
      resultText = message.subtype === 'success' ? message.result : ''
      success = message.subtype === 'success' && !message.is_error
      console.log(`  📊 Result: success=${success}, cost=$${message.total_cost_usd?.toFixed(4)}`)
    }
  }

  // Verify tool restrictions: sub-agent should only have used Read/Glob, not Bash
  const usedForbiddenTool = subAgentTools.some((t) => ['Bash', 'Write', 'Edit'].includes(t))
  const usedAllowedTool = subAgentTools.some((t) => ['Read', 'Glob'].includes(t))
  const packageNameFound = resultText.includes('test-agent-sdk')

  const passed = success && sawTaskStarted && !usedForbiddenTool
  console.log(`\n  ${passed ? '✅ PASS' : '❌ FAIL'}: ${TEST_NAME}`)
  console.log(`    - Task started: ${sawTaskStarted}`)
  console.log(`    - Task notification: ${sawTaskNotification}`)
  console.log(`    - Used allowed tools: ${usedAllowedTool} (${subAgentTools.join(', ') || 'none tracked'})`)
  console.log(`    - Used forbidden tool: ${usedForbiddenTool}`)
  console.log(`    - Package name found in result: ${packageNameFound}`)
  console.log(`    - Result success: ${success}`)
  if (resultText) {
    console.log(`    - Result text: ${resultText.slice(0, 300)}`)
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
  runTest5().then((passed) => process.exit(passed ? 0 : 1))
}
