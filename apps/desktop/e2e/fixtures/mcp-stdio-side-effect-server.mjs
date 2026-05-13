#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'

const STARTUP_MARKER_PATH = process.env.E2E_STARTUP_MARKER_PATH

async function tryWriteStartupMarker() {
  if (!STARTUP_MARKER_PATH) return

  try {
    await fs.mkdir(path.dirname(STARTUP_MARKER_PATH), { recursive: true })
    await fs.writeFile(STARTUP_MARKER_PATH, 'startup-ok', 'utf8')
  } catch {
    // Keep startup silent. Tests verify host-side effects instead.
  }
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function ok(id, result) {
  send({ jsonrpc: '2.0', id, result })
}

function error(id, message, code = -32000, data) {
  send({
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  })
}

async function handleRequest(message) {
  const { id, method, params } = message

  if (method === 'initialize') {
    ok(id, {
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'e2e-side-effect-mcp', version: '0.0.1' },
    })
    return
  }

  if (method === 'tools/list') {
    ok(id, {
      tools: [
        {
          name: 'echo_text',
          description: 'Echo text back to confirm the MCP server is reachable.',
          inputSchema: {
            type: 'object',
            properties: {
              text: { type: 'string' },
            },
            required: ['text'],
          },
        },
        {
          name: 'write_marker',
          description: 'Write a marker file to a specific path on disk.',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['filePath', 'content'],
          },
        },
      ],
    })
    return
  }

  if (method === 'tools/call') {
    const toolName = params?.name
    const args = params?.arguments ?? {}

    if (toolName === 'echo_text') {
      ok(id, {
        content: [{ type: 'text', text: `echo:${args.text ?? ''}` }],
      })
      return
    }

    if (toolName === 'write_marker') {
      const filePath = args.filePath
      const content = args.content

      if (typeof filePath !== 'string' || typeof content !== 'string') {
        ok(id, {
          content: [{ type: 'text', text: 'filePath and content are required' }],
          isError: true,
        })
        return
      }

      try {
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, content, 'utf8')
        ok(id, {
          content: [{ type: 'text', text: `wrote:${filePath}` }],
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        ok(id, {
          content: [{ type: 'text', text: `write_failed:${message}` }],
          isError: true,
        })
      }
      return
    }

    ok(id, {
      content: [{ type: 'text', text: `unknown_tool:${toolName}` }],
      isError: true,
    })
    return
  }

  if (method === 'notifications/initialized') {
    return
  }

  if (id !== undefined) {
    error(id, `Unsupported method: ${method}`, -32601)
  }
}

await tryWriteStartupMarker()

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
})

rl.on('line', line => {
  if (!line.trim()) return

  try {
    const message = JSON.parse(line)
    void handleRequest(message)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(`invalid message: ${message}\n`)
  }
})
