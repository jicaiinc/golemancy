/**
 * Test 7: Combined Test - Multiple sub-agents with different configurations
 * - Define multiple sub-agents, each with unique config
 * - Main agent dispatches to different sub-agents based on task
 * - Verify: all per-agent configurations work independently
 */
delete process.env.CLAUDECODE
import { query, createSdkMcpServer, tool, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

const TEST_NAME = 'Test 7: Combined (Multiple Sub-agents)'

export async function runTest7() {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`🧪 ${TEST_NAME}`)
  console.log(`${'='.repeat(60)}`)

  const cwd = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

  // Track which tools get called
  let timestampCalled = false
  let uppercaseCalled = false

  const utilsServer = createSdkMcpServer({
    name: 'utils',
    version: '1.0.0',
    tools: [
      tool(
        'get_timestamp',
        'Returns the current Unix timestamp',
        {},
        async () => {
          timestampCalled = true
          const ts = Date.now()
          console.log(`  ⏰ Timestamp tool called: ${ts}`)
          return {
            content: [{ type: 'text' as const, text: `Current timestamp: ${ts}` }],
          }
        },
      ),
      tool(
        'to_uppercase',
        'Converts a string to uppercase',
        {
          text: z.string().describe('Text to convert to uppercase'),
        },
        async (args) => {
          uppercaseCalled = true
          const result = args.text.toUpperCase()
          console.log(`  🔤 Uppercase tool called: "${args.text}" → "${result}"`)
          return {
            content: [{ type: 'text' as const, text: result }],
          }
        },
      ),
    ],
  })

  async function* generateMessages() {
    yield {
      type: 'user' as const,
      message: {
        role: 'user' as const,
        content: `You have three sub-agents with different capabilities:
1. "time-agent" - can get timestamps using the get_timestamp tool
2. "text-agent" - can convert text to uppercase using the to_uppercase tool
3. "reader-agent" - can only read files (Read tool)

Please do the following tasks in sequence:
1. Use the Task tool to spawn "time-agent" with prompt: "Use the get_timestamp tool to get the current timestamp and report it."
2. Use the Task tool to spawn "text-agent" with prompt: "Use the to_uppercase tool to convert 'hello world' to uppercase and report the result."
3. Use the Task tool to spawn "reader-agent" with prompt: "Read the file package.json and report the name field."

After all three complete, summarize what each agent returned.`,
      },
      session_id: '',
      parent_tool_use_id: null,
    }
  }

  const stream = query({
    prompt: generateMessages(),
    options: {
      model: 'claude-sonnet-4-6',
      maxTurns: 25,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      cwd,
      mcpServers: {
        utils: utilsServer,
      },
      agents: {
        'time-agent': {
          description: 'An agent that can get the current timestamp',
          prompt: 'You are a time agent. Use the get_timestamp tool to get timestamps.',
          model: 'haiku',
          mcpServers: ['utils'],
          disallowedTools: ['Bash', 'Write', 'Edit'],
        },
        'text-agent': {
          description: 'An agent that can transform text to uppercase',
          prompt: 'You are a text transformation agent. Use the to_uppercase tool to transform text.',
          model: 'haiku',
          mcpServers: ['utils'],
          disallowedTools: ['Bash', 'Write', 'Edit'],
        },
        'reader-agent': {
          description: 'A read-only agent that can only read files',
          prompt: 'You are a read-only agent. Only use the Read tool to read files.',
          model: 'haiku',
          tools: ['Read'],
        },
      },
    },
  })

  let taskStartCount = 0
  let taskNotificationCount = 0
  const taskDescriptions: string[] = []
  let resultText = ''
  let success = false

  for await (const message of stream) {
    logMessage(message)

    if (message.type === 'system' && message.subtype === 'init') {
      console.log(`  📋 Available agents: ${message.agents?.join(', ') ?? 'none'}`)
    }

    if (message.type === 'system' && message.subtype === 'task_started') {
      taskStartCount++
      taskDescriptions.push(message.description)
      console.log(`  🚀 Task started (#${taskStartCount}): ${message.description}`)
    }

    if (message.type === 'system' && message.subtype === 'task_notification') {
      taskNotificationCount++
      console.log(`  📨 Task notification (#${taskNotificationCount}): status=${message.status}, summary=${message.summary}`)
    }

    if (message.type === 'result') {
      resultText = message.subtype === 'success' ? message.result : ''
      success = message.subtype === 'success' && !message.is_error
      console.log(`  📊 Result: success=${success}, cost=$${message.total_cost_usd?.toFixed(4)}`)
    }
  }

  // Verify all agents were spawned and custom tools were called
  const allAgentsSpawned = taskStartCount >= 3
  const passed = success && allAgentsSpawned && timestampCalled && uppercaseCalled

  console.log(`\n  ${passed ? '✅ PASS' : '❌ FAIL'}: ${TEST_NAME}`)
  console.log(`    - Tasks started: ${taskStartCount} (expected >= 3)`)
  console.log(`    - Task notifications: ${taskNotificationCount}`)
  console.log(`    - Timestamp tool called: ${timestampCalled}`)
  console.log(`    - Uppercase tool called: ${uppercaseCalled}`)
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
  runTest7().then((passed) => process.exit(passed ? 0 : 1))
}
