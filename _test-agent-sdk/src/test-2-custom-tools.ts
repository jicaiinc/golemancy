/**
 * Test 2: Sub-agent + Custom Tools (MCP)
 * - Create in-process MCP server with createSdkMcpServer() + tool()
 * - Register MCP server at top level
 * - Sub-agent references MCP server via mcpServers: ["server-name"]
 * - Verify: sub-agent can call custom tools
 */
delete process.env.CLAUDECODE
import { query, createSdkMcpServer, tool, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

const TEST_NAME = 'Test 2: Sub-agent + Custom Tools (MCP)'

export async function runTest2() {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`🧪 ${TEST_NAME}`)
  console.log(`${'='.repeat(60)}`)

  const cwd = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

  // Create in-process MCP server with a custom tool
  let toolWasCalled = false
  const calculatorServer = createSdkMcpServer({
    name: 'calculator',
    version: '1.0.0',
    tools: [
      tool(
        'add_numbers',
        'Add two numbers together and return the result',
        {
          a: z.number().describe('First number'),
          b: z.number().describe('Second number'),
        },
        async (args) => {
          toolWasCalled = true
          const result = args.a + args.b
          console.log(`  🔢 Calculator tool called: ${args.a} + ${args.b} = ${result}`)
          return {
            content: [{ type: 'text' as const, text: `The sum of ${args.a} and ${args.b} is ${result}` }],
          }
        },
      ),
    ],
  })

  // Must use async generator prompt for in-process MCP servers
  async function* generateMessages() {
    yield {
      type: 'user' as const,
      message: {
        role: 'user' as const,
        content: 'Use the Task tool to spawn the "math-helper" sub-agent with this prompt: "Use the add_numbers tool to calculate 17 + 25, and report the exact result." Then tell me the result.',
      },
      session_id: '',
      parent_tool_use_id: null,
    }
  }

  const stream = query({
    prompt: generateMessages(),
    options: {
      model: 'claude-sonnet-4-6',
      maxTurns: 15,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      cwd,
      mcpServers: {
        calculator: calculatorServer,
      },
      agents: {
        'math-helper': {
          description: 'A math helper agent that can perform calculations using the calculator tools',
          prompt: 'You are a math helper. Use the add_numbers tool to perform calculations. Always use the tool, never calculate mentally.',
          model: 'haiku',
          mcpServers: ['calculator'],
        },
      },
    },
  })

  let sawTaskStarted = false
  let sawTaskNotification = false
  let success = false

  for await (const message of stream) {
    logMessage(message)

    if (message.type === 'system' && message.subtype === 'task_started') {
      sawTaskStarted = true
      console.log(`  🚀 Task started: ${message.description}`)
    }

    if (message.type === 'system' && message.subtype === 'task_notification') {
      sawTaskNotification = true
      console.log(`  📨 Task notification: status=${message.status}, summary=${message.summary}`)
    }

    if (message.type === 'result') {
      success = message.subtype === 'success' && !message.is_error
      console.log(`  📊 Result: success=${success}, cost=$${message.total_cost_usd?.toFixed(4)}`)
    }
  }

  const passed = success && sawTaskStarted && toolWasCalled
  console.log(`\n  ${passed ? '✅ PASS' : '❌ FAIL'}: ${TEST_NAME}`)
  console.log(`    - Task started: ${sawTaskStarted}`)
  console.log(`    - Task notification: ${sawTaskNotification}`)
  console.log(`    - Custom tool was called: ${toolWasCalled}`)
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
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTest2().then((passed) => process.exit(passed ? 0 : 1))
}
