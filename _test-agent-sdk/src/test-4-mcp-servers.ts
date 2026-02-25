/**
 * Test 4: Sub-agent + Independent MCP Servers (inline stdio)
 * - Sub-agent defines an inline MCP server (stdio type)
 * - Verify: sub-agent has its own independent MCP connection
 * - The MCP server provides an "echo" tool that prefixes messages with "ECHO:"
 *
 * Key: The MCP server script uses absolute paths for module resolution
 * since the CLI spawns it as a child process.
 */
delete process.env.CLAUDECODE
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { writeFileSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'

const TEST_NAME = 'Test 4: Sub-agent + Inline MCP Server (stdio)'

export async function runTest4() {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`🧪 ${TEST_NAME}`)
  console.log(`${'='.repeat(60)}`)

  const cwd = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

  // Create a minimal MCP server script
  const mcpServerDir = join(cwd, '.tmp')
  mkdirSync(mcpServerDir, { recursive: true })
  const mcpServerScript = join(mcpServerDir, 'echo-mcp-server.mjs')

  // Use bare specifiers — NODE_PATH env ensures module resolution works
  const nodeModulesPath = resolve(cwd, 'node_modules')
  console.log(`  📂 NODE_PATH: ${nodeModulesPath}`)

  // Use the high-level McpServer API (simpler than raw Server + schemas)
  writeFileSync(
    mcpServerScript,
    `import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'echo-server', version: '1.0.0' });

server.tool('echo', 'Echoes back the input message with a prefix ECHO:', { message: z.string() }, async ({ message }) => {
  return { content: [{ type: 'text', text: 'ECHO: ' + message }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
`,
  )

  // First verify the MCP server script can start
  console.log(`  📝 MCP server script: ${mcpServerScript}`)

  const stderrLines: string[] = []

  const stream = query({
    prompt: `You have a sub-agent called "echo-agent" that has access to an echo MCP server with a tool called "echo". Use the Task tool to spawn it with this prompt: "Use the mcp__echo-server__echo tool to echo the message 'Hello from sub-agent'. Report the EXACT response text." Then report what the sub-agent says.`,
    options: {
      model: 'claude-sonnet-4-6',
      maxTurns: 15,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      cwd,
      stderr: (data: string) => {
        const line = data.trim()
        if (line) {
          stderrLines.push(line)
          // Show MCP-related stderr
          if (line.toLowerCase().includes('mcp') || line.toLowerCase().includes('echo-server')) {
            console.log(`  [stderr:mcp] ${line}`)
          }
        }
      },
      agents: {
        'echo-agent': {
          description: 'An agent that can echo messages using the echo MCP server',
          prompt: 'You have access to an echo tool via MCP. The tool name is mcp__echo-server__echo. Use it when asked to echo messages. Do NOT use the Bash tool to echo.',
          model: 'haiku',
          mcpServers: [
            {
              'echo-server': {
                command: 'node',
                args: [mcpServerScript],
                env: {
                  NODE_PATH: nodeModulesPath,
                },
              },
            },
          ],
        },
      },
    },
  })

  let sawTaskStarted = false
  let resultText = ''
  let success = false
  let mcpToolUsed = false

  for await (const message of stream) {
    logMessage(message)

    if (message.type === 'system' && message.subtype === 'init') {
      console.log(`  📋 Available agents: ${message.agents?.join(', ') ?? 'none'}`)
      console.log(`  🔧 Tools: ${message.tools.join(', ')}`)
    }

    if (message.type === 'system' && message.subtype === 'task_started') {
      sawTaskStarted = true
      console.log(`  🚀 Task started: ${message.description}`)
    }

    if (message.type === 'system' && message.subtype === 'task_notification') {
      console.log(`  📨 Task notification: status=${message.status}, summary=${message.summary}`)
    }

    // Track MCP tool usage
    if (message.type === 'tool_progress' && message.tool_name?.includes('echo')) {
      mcpToolUsed = true
      console.log(`  🔧 MCP tool used: ${message.tool_name}`)
    }

    if (message.type === 'result') {
      resultText = message.subtype === 'success' ? message.result : ''
      success = message.subtype === 'success' && !message.is_error
      console.log(`  📊 Result: success=${success}, cost=$${message.total_cost_usd?.toFixed(4)}`)
    }
  }

  // Check if the "ECHO:" prefix is in the result (proves MCP tool was used, not Bash echo)
  const mcpEchoUsed = resultText.includes('ECHO:')
  const echoFound = resultText.toLowerCase().includes('hello from sub-agent')

  // Show stderr hints about MCP
  const mcpStderr = stderrLines.filter((l) => l.toLowerCase().includes('mcp') || l.toLowerCase().includes('echo'))
  if (mcpStderr.length > 0) {
    console.log(`  📝 MCP-related stderr (${mcpStderr.length} lines):`)
    mcpStderr.slice(0, 5).forEach((l) => console.log(`    ${l}`))
  }

  const passed = success && sawTaskStarted && mcpEchoUsed
  console.log(`\n  ${passed ? '✅ PASS' : '❌ FAIL'}: ${TEST_NAME}`)
  console.log(`    - Task started: ${sawTaskStarted}`)
  console.log(`    - Result success: ${success}`)
  console.log(`    - MCP echo tool used (ECHO: prefix): ${mcpEchoUsed}`)
  console.log(`    - Echo content in result: ${echoFound}`)
  if (!mcpEchoUsed && echoFound) {
    console.log(`    ⚠️  Sub-agent used Bash echo instead of MCP echo tool!`)
  }
  if (resultText) {
    console.log(`    - Result text: ${resultText.slice(0, 400)}`)
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
  runTest4().then((passed) => process.exit(passed ? 0 : 1))
}
