/**
 * Template MCP connectivity live tests.
 *
 * Verifies that each unique MCP server declared across project templates can
 * connect and return at least one tool via the MCP protocol.
 *
 * Deduplicates by MCP name — static tests (template-registry.test.ts) already
 * verify that same-named MCPs use identical command+args across templates.
 *
 * Run all:          pnpm --filter @golemancy/server test:live
 * Single MCP:       pnpm --filter @golemancy/server exec vitest run --config vitest.config.live.ts -t "open-websearch"
 * This file only:   pnpm --filter @golemancy/server exec vitest run --config vitest.config.live.ts src/storage/template-mcp.live.test.ts
 */
import os from 'node:os'
import { describe, it, expect } from 'vitest'
import { PROJECT_TEMPLATES } from '@golemancy/shared'
import type { ChildProcess } from 'node:child_process'
import { createMCPClient } from '@ai-sdk/mcp'
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio'
import { buildMCPRuntimeEnv } from '../runtime/env-builder'

// ── Config ──────────────────────────────────────────────────

const NETWORK_TIMEOUT = 60_000
const LOCAL_TIMEOUT = 30_000

/** MCP servers that need network to download on first run */
const NETWORK_MCPS = new Set(['open-websearch', 'fetch', 'playwright'])

// ── Helpers ─────────────────────────────────────────────────

function resolveArgs(args: string[]): string[] {
  return args.map(a => (a === '{{workspaceDir}}' ? os.tmpdir() : a))
}

/**
 * Build a clean env for spawning MCP child processes.
 *
 * MCPPool uses `{ ...process.env, ...mcpRuntimeEnv, ...server.env }` which
 * leaks vitest/pnpm env vars (npm_config_*, VITEST, etc.) into child
 * processes. Some MCP servers (e.g. open-websearch) are sensitive to these —
 * pnpm's npm_config_* vars change the npx cache hash, potentially resolving
 * to a different (broken) package version.
 *
 * We build a minimal env with only what MCP servers need:
 * - PATH from buildMCPRuntimeEnv (includes bundled Node.js)
 * - npm_config_cache from buildMCPRuntimeEnv
 * - HOME (required by npm/uvx for config/cache paths)
 * - Essential system vars
 */
function buildCleanEnv(): Record<string, string> {
  const mcpEnv = buildMCPRuntimeEnv()
  const env: Record<string, string> = {
    PATH: mcpEnv.PATH || process.env.PATH || '',
    HOME: process.env.HOME || '',
    USER: process.env.USER || '',
    SHELL: process.env.SHELL || '/bin/sh',
    LANG: process.env.LANG || 'en_US.UTF-8',
    TERM: process.env.TERM || 'xterm-256color',
    PORT: '0',
  }
  if (mcpEnv.npm_config_cache) {
    env.npm_config_cache = mcpEnv.npm_config_cache
  }
  // XDG dirs needed by uvx
  if (process.env.XDG_DATA_HOME) env.XDG_DATA_HOME = process.env.XDG_DATA_HOME
  if (process.env.XDG_CACHE_HOME) env.XDG_CACHE_HOME = process.env.XDG_CACHE_HOME
  return env
}

interface UniqueMCP {
  name: string
  command: string
  args: string[]
}

function collectUniqueMCPs(): UniqueMCP[] {
  const seen = new Map<string, UniqueMCP>()
  for (const template of PROJECT_TEMPLATES) {
    for (const mcp of template.mcpServers) {
      if (seen.has(mcp.name)) continue
      if (mcp.transportType !== 'stdio' || !mcp.command || !mcp.args) continue
      seen.set(mcp.name, {
        name: mcp.name,
        command: mcp.command,
        args: resolveArgs(mcp.args),
      })
    }
  }
  return [...seen.values()]
}

// ── Tests ───────────────────────────────────────────────────

const uniqueMCPs = collectUniqueMCPs()
const cleanEnv = buildCleanEnv()

describe('template-mcp.live', () => {
  it('has expected number of unique MCP servers', () => {
    expect(uniqueMCPs.length).toBe(7)
  })

  for (const mcp of uniqueMCPs) {
    const timeout = NETWORK_MCPS.has(mcp.name) ? NETWORK_TIMEOUT : LOCAL_TIMEOUT

    it(
      `${mcp.name} connects and exposes tools`,
      async () => {
        const transport = new Experimental_StdioMCPTransport({
          command: mcp.command,
          args: mcp.args,
          env: cleanEnv,
          stderr: 'pipe',
        })

        // Capture stderr for diagnostics on failure
        let stderr = ''
        const originalStart = transport.start.bind(transport)
        transport.start = async function (this: typeof transport) {
          await originalStart()
          const proc = (this as unknown as { process?: ChildProcess }).process
          proc?.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
        }

        const client = await createMCPClient({ transport })
        try {
          const tools = await client.tools()
          const toolCount = Object.keys(tools).length
          expect(toolCount, `MCP "${mcp.name}" returned 0 tools`).toBeGreaterThan(0)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          throw new Error(
            `MCP "${mcp.name}" failed: ${msg}${stderr ? `\n\nServer stderr:\n${stderr}` : ''}`,
          )
        } finally {
          await client.close()
        }
      },
      timeout,
    )
  }
})
