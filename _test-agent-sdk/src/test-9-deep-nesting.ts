/**
 * Test 9: 3-Level Deep Nesting via Recursive MCP Bridge
 *
 * Architecture:
 *   Level 0 (Main Agent)
 *     → Task tool → Level 1 sub-agent
 *       → MCP "delegate_task" → query() → Level 2 agent
 *         → Level 2 also has MCP "delegate_task" → query() → Level 3 agent
 *           → Level 3 returns magic string
 *
 * This proves unlimited nesting by demonstrating 3 full levels.
 * Each level's MCP bridge spawns an independent CLI session.
 *
 * If Test 8 proves Level 0→1→2, this test proves the pattern is recursive:
 * the bridged agent (Level 2) can ALSO use the bridge to reach Level 3.
 */
delete process.env.CLAUDECODE
import { query, createSdkMcpServer, tool, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

const TEST_NAME = 'Test 9: 3-Level Deep Nesting (L0 → L1 → L2 → L3)'

export async function runTest9() {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`🧪 ${TEST_NAME}`)
  console.log(`${'='.repeat(60)}`)

  const cwd = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

  // Track execution at each level
  const levelReached = { 1: false, 2: false, 3: false }
  let bridgeCallCount = 0

  // === Recursive MCP Bridge Factory ===
  // Creates a bridge server at a given depth.
  // - At depth < maxDepth: the bridged agent also gets a bridge server (recursive)
  // - At depth === maxDepth: the bridged agent is a leaf (no more nesting)
  function createBridgeServer(currentDepth: number, maxDepth: number) {
    return createSdkMcpServer({
      name: 'agent-bridge',
      version: '1.0.0',
      tools: [
        tool(
          'delegate_task',
          'Delegate a task to a deeper-level agent. The nested agent will process the task and return its result.',
          {
            task: z.string().describe('The task/prompt for the nested agent'),
          },
          async (args) => {
            bridgeCallCount++
            const nextLevel = currentDepth + 1
            console.log(`  🌉 [Depth ${currentDepth}→${nextLevel}] Bridge called (call #${bridgeCallCount})`)
            console.log(`  🌉 Task: ${args.task.slice(0, 120)}`)

            try {
              let result = ''
              const isLeaf = nextLevel >= maxDepth

              if (isLeaf) {
                // Leaf level: simple agent, no more bridge
                console.log(`  🌉 [Depth ${nextLevel}] Spawning LEAF agent (no further nesting)`)
                for await (const msg of query({
                  prompt: args.task,
                  options: {
                    model: 'haiku',
                    maxTurns: 3,
                    permissionMode: 'bypassPermissions',
                    allowDangerouslySkipPermissions: true,
                    cwd,
                  },
                })) {
                  if (msg.type === 'result' && msg.subtype === 'success') {
                    result = msg.result
                    levelReached[nextLevel as keyof typeof levelReached] = true
                    console.log(`  🌉 [Depth ${nextLevel}] Leaf result: ${result.slice(0, 100)}`)
                  }
                }
              } else {
                // Intermediate level: agent with its own bridge for further nesting
                console.log(`  🌉 [Depth ${nextLevel}] Spawning INTERMEDIATE agent with bridge`)
                const nestedBridge = createBridgeServer(nextLevel, maxDepth)

                async function* genMsg() {
                  yield {
                    type: 'user' as const,
                    message: {
                      role: 'user' as const,
                      content: args.task,
                    },
                    session_id: '',
                    parent_tool_use_id: null,
                  }
                }

                for await (const msg of query({
                  prompt: genMsg(),
                  options: {
                    model: 'haiku',
                    maxTurns: 10,
                    permissionMode: 'bypassPermissions',
                    allowDangerouslySkipPermissions: true,
                    cwd,
                    mcpServers: {
                      'agent-bridge': nestedBridge,
                    },
                    allowedTools: ['mcp__agent-bridge__delegate_task'],
                  },
                })) {
                  if (msg.type === 'result' && msg.subtype === 'success') {
                    result = msg.result
                    levelReached[nextLevel as keyof typeof levelReached] = true
                    console.log(`  🌉 [Depth ${nextLevel}] Intermediate result: ${result.slice(0, 100)}`)
                  }
                }
              }

              return {
                content: [
                  {
                    type: 'text' as const,
                    text: result || `Level ${nextLevel} agent returned no result`,
                  },
                ],
              }
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error)
              console.log(`  🌉 Bridge error at depth ${currentDepth}: ${msg}`)
              return {
                content: [{ type: 'text' as const, text: `Bridge error: ${msg}` }],
              }
            }
          },
        ),
      ],
    })
  }

  // Create the top-level bridge (Level 1 → Level 2, with Level 2 → Level 3 recursive)
  const topBridge = createBridgeServer(1, 3) // depth 1, maxDepth 3

  // === Main Agent Prompt ===
  // Level 0 → Task → Level 1 (sub-agent with bridge) → delegate_task → Level 2 → delegate_task → Level 3
  async function* generateMessages() {
    yield {
      type: 'user' as const,
      message: {
        role: 'user' as const,
        content:
          'Use the Task tool to spawn the "deep-agent" sub-agent with this prompt: ' +
          '"Use the delegate_task tool to delegate this task: ' +
          'Use the delegate_task tool to delegate this task: ' +
          'Respond with EXACTLY the text DEEP_LEVEL3_MAGIC_a1b2c3. Nothing else, just that exact string. ' +
          'Then report whatever result you get back." ' +
          'Then report whatever result you get back." ' +
          'Report the final result.',
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
        'agent-bridge': topBridge,
      },
      allowedTools: ['Task', 'mcp__agent-bridge__delegate_task'],
      agents: {
        'deep-agent': {
          description: 'An agent that delegates tasks to deeper levels via the delegate_task MCP tool',
          prompt:
            'You are a delegation agent. When asked to delegate a task, use the delegate_task tool. Pass the task exactly as described. Report the result you get back.',
          model: 'haiku',
          mcpServers: ['agent-bridge'],
        },
      },
    },
  })

  let sawTaskStarted = false
  let resultText = ''
  let success = false

  for await (const message of stream) {
    logMessage(message)

    if (message.type === 'system' && message.subtype === 'task_started') {
      sawTaskStarted = true
      levelReached[1] = true
      console.log(`  🚀 Task started: ${message.description}`)
    }

    if (message.type === 'result') {
      resultText = message.subtype === 'success' ? message.result : ''
      success = message.subtype === 'success' && !message.is_error
      console.log(`  📊 Result: success=${success}, cost=$${message.total_cost_usd?.toFixed(4)}`)
    }
  }

  // === Assertions ===
  const magicStringFound = resultText.includes('DEEP_LEVEL3_MAGIC_a1b2c3')
  const allLevelsReached = levelReached[1] && levelReached[2] && levelReached[3]

  const passed = success && sawTaskStarted && allLevelsReached && bridgeCallCount >= 2

  console.log(`\n  ${passed ? '✅ PASS' : '❌ FAIL'}: ${TEST_NAME}`)
  console.log(`    - Level 1 reached (Task): ${levelReached[1]}`)
  console.log(`    - Level 2 reached (bridge #1): ${levelReached[2]}`)
  console.log(`    - Level 3 reached (bridge #2): ${levelReached[3]}`)
  console.log(`    - Bridge call count: ${bridgeCallCount} (expected: ≥2)`)
  console.log(`    - Magic string found: ${magicStringFound}`)
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
  runTest9().then((passed) => process.exit(passed ? 0 : 1))
}
