/**
 * Test 8: Unlimited Sub-agent Nesting via MCP Tool Bridge
 *
 * Architecture:
 *   Level 0 (Main Agent)
 *     → spawns sub-agent via Task tool (SDK native, allowed)
 *       → Level 1 sub-agent calls MCP tool "delegate_task"
 *         → MCP tool handler internally calls query() → NEW CLI subprocess
 *           → Level 2 agent runs, returns result back through MCP
 *
 * This bypasses the iP6 Task tool filtering because:
 * - iP6 only filters the "Task" tool from sub-agents
 * - MCP tools are NOT filtered by iP6
 * - query() inside MCP handler creates an independent CLI session
 *
 * If this works, unlimited nesting is achievable by induction:
 * - Each level can have the same MCP bridge tool
 * - Each call to query() creates a fresh session with no iP6 inheritance
 */
delete process.env.CLAUDECODE
import { query, createSdkMcpServer, tool, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

const TEST_NAME = 'Test 8: MCP Bridge Nesting (Level 0 → 1 → 2)'

export async function runTest8() {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`🧪 ${TEST_NAME}`)
  console.log(`${'='.repeat(60)}`)

  const cwd = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

  // Track execution at each level
  let level1Executed = false
  let level2Executed = false
  let bridgeToolCalled = false

  // === MCP Bridge Tool ===
  // This is the key innovation: an MCP tool that internally calls query()
  // to create a completely independent agent session (Level 2).
  const agentBridgeServer = createSdkMcpServer({
    name: 'agent-bridge',
    version: '1.0.0',
    tools: [
      tool(
        'delegate_task',
        'Delegate a task to a nested agent. The nested agent will process the task and return its result. Use this when you need to spawn a sub-agent.',
        {
          task: z.string().describe('The task/prompt for the nested agent to execute'),
        },
        async (args) => {
          bridgeToolCalled = true
          console.log(`  🌉 Bridge tool called! Spawning Level 2 agent...`)
          console.log(`  🌉 Task: ${args.task.slice(0, 100)}`)

          try {
            let result = ''

            // This query() call creates a COMPLETELY NEW CLI subprocess.
            // It is independent from the parent — no iP6 filtering applies.
            for await (const msg of query({
              prompt: args.task,
              options: {
                model: 'haiku',
                maxTurns: 5,
                permissionMode: 'bypassPermissions',
                allowDangerouslySkipPermissions: true,
                cwd,
              },
            })) {
              if (msg.type === 'result' && msg.subtype === 'success') {
                result = msg.result
                level2Executed = true
                console.log(`  🌉 Level 2 agent completed! Result: ${result.slice(0, 150)}`)
              }
            }

            return {
              content: [
                {
                  type: 'text' as const,
                  text: result || 'Level 2 agent returned no result',
                },
              ],
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            console.log(`  🌉 Bridge error: ${msg}`)
            return {
              content: [{ type: 'text' as const, text: `Bridge error: ${msg}` }],
            }
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
        content:
          'Use the Task tool to spawn the "nesting-agent" sub-agent with this prompt: ' +
          '"You have access to the delegate_task MCP tool. Use the delegate_task tool to delegate the following task to a nested agent: ' +
          'Respond with EXACTLY the text LEVEL2_MAGIC_STRING_7f3a9b. Nothing else, just that exact string." ' +
          'Report the result from the sub-agent.',
      },
      session_id: '',
      parent_tool_use_id: null,
    }
  }

  const stream = query({
    prompt: generateMessages(),
    options: {
      model: 'claude-sonnet-4-6',
      maxTurns: 20,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      cwd,
      mcpServers: {
        'agent-bridge': agentBridgeServer,
      },
      allowedTools: ['Task', 'mcp__agent-bridge__delegate_task'],
      agents: {
        'nesting-agent': {
          description:
            'An agent that can delegate tasks to nested agents via the delegate_task MCP tool',
          prompt:
            'You are a delegation agent. When asked to delegate a task, use the delegate_task tool from the agent-bridge MCP server. Pass the task exactly as described. Report the result you get back.',
          model: 'haiku',
          mcpServers: ['agent-bridge'],
        },
      },
    },
  })

  let sawTaskStarted = false
  let taskStartCount = 0
  let resultText = ''
  let success = false

  for await (const message of stream) {
    logMessage(message)

    if (message.type === 'system' && message.subtype === 'task_started') {
      taskStartCount++
      sawTaskStarted = true
      level1Executed = true
      console.log(`  🚀 Task started (#${taskStartCount}): ${message.description}`)
    }

    if (message.type === 'result') {
      resultText = message.subtype === 'success' ? message.result : ''
      success = message.subtype === 'success' && !message.is_error
      console.log(`  📊 Result: success=${success}, cost=$${message.total_cost_usd?.toFixed(4)}`)
    }
  }

  // === Assertions ===
  // 1. Level 1 sub-agent was spawned via Task tool
  // 2. Bridge MCP tool was called by Level 1 sub-agent
  // 3. Level 2 agent executed (inside the MCP bridge handler)
  // 4. The magic string from Level 2 propagated back through the chain
  const magicStringFound = resultText.includes('LEVEL2_MAGIC_STRING_7f3a9b')

  const passed = success && sawTaskStarted && bridgeToolCalled && level2Executed && magicStringFound

  console.log(`\n  ${passed ? '✅ PASS' : '❌ FAIL'}: ${TEST_NAME}`)
  console.log(`    - Level 1 spawned (Task started): ${sawTaskStarted}`)
  console.log(`    - Level 1 executed: ${level1Executed}`)
  console.log(`    - Bridge tool called: ${bridgeToolCalled}`)
  console.log(`    - Level 2 executed: ${level2Executed}`)
  console.log(`    - Magic string propagated: ${magicStringFound}`)
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
            console.log(
              `  💬 Assistant: ${block.text.slice(0, 200)}${block.text.length > 200 ? '...' : ''}`,
            )
          }
          if ('type' in block && block.type === 'tool_use') {
            console.log(
              `  🔧 Tool call: ${block.name}(${JSON.stringify(block.input).slice(0, 100)})`,
            )
          }
        }
      }
      break
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTest8().then((passed) => process.exit(passed ? 0 : 1))
}
