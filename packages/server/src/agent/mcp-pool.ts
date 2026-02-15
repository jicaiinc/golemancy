import { createHash } from 'node:crypto'
import type { ChildProcess } from 'node:child_process'
import { createMCPClient } from '@ai-sdk/mcp'
import type { ToolSet } from 'ai'
import type {
  MCPServerConfig,
  MCPTransportType,
  PermissionMode,
  PermissionsConfig,
  ProjectId,
  SandboxConfig,
  SupportedPlatform,
} from '@golemancy/shared'
import { isSandboxRuntimeSupported } from '@golemancy/shared'
import type { MCPLoadOptions } from './mcp'
import { sandboxPool } from './sandbox-pool'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:mcp-pool' })

// ── Stderr Capture ──────────────────────────────────────────────

const DEFAULT_MAX_STDERR_BYTES = 8 * 1024  // 8 KB

class StderrCapture {
  private chunks: Buffer[] = []
  private totalBytes = 0
  private readonly maxBytes: number

  constructor(maxBytes = DEFAULT_MAX_STDERR_BYTES) {
    this.maxBytes = maxBytes
  }

  /** Attach to a child process's stderr stream. */
  attach(proc: ChildProcess): void {
    proc.stderr?.on('data', (chunk: Buffer) => {
      log.debug({ stderr: chunk.toString('utf-8').trimEnd() }, 'MCP server stderr')

      if (this.totalBytes < this.maxBytes) {
        const remaining = this.maxBytes - this.totalBytes
        const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk
        this.chunks.push(slice)
        this.totalBytes += slice.length
      }
    })
  }

  /** Return captured stderr as a trimmed UTF-8 string. */
  getText(): string {
    if (this.chunks.length === 0) return ''
    const text = Buffer.concat(this.chunks).toString('utf-8').trim()
    const wasTruncated = this.totalBytes >= this.maxBytes
    return wasTruncated ? text + '\n... (truncated)' : text
  }
}

interface BuildTransportResult {
  transport: Parameters<typeof createMCPClient>[0]['transport']
  stderrCapture: StderrCapture | null
}

// ── Pool Constants ──────────────────────────────────────────────

const DEFAULT_IDLE_SCAN_INTERVAL_MS = 5 * 60 * 1000  // 5 minutes
const DEFAULT_MAX_IDLE_MS = 30 * 60 * 1000           // 30 minutes

// ── Fingerprint ────────────────────────────────────────────────

/**
 * Immutable snapshot of all factors that determine how an MCP server
 * connection is configured. Used for cache invalidation — any change
 * in fingerprint means the existing connection is stale.
 */
interface MCPPoolFingerprint {
  /** Permission mode: 'restricted' | 'sandbox' | 'unrestricted' */
  mode: PermissionMode
  /** Whether sandbox wrapping is applied to this MCP server */
  sandboxWrapped: boolean
  /**
   * SHA-256 hash of the sandbox config (PermissionsConfig) when sandboxWrapped=true.
   * Empty string when sandboxWrapped=false.
   */
  sandboxConfigHash: string
  /** Transport type: 'stdio' | 'http' | 'sse' */
  transportType: MCPTransportType
  // --- stdio-specific fields ---
  command: string | undefined
  args: string[] | undefined
  env: Record<string, string> | undefined
  cwd: string | undefined
  // --- http/sse-specific fields ---
  url: string | undefined
  headers: Record<string, string> | undefined
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function computeFingerprint(
  server: MCPServerConfig,
  options: MCPLoadOptions | undefined,
  effectiveCwd: string | undefined,
): MCPPoolFingerprint {
  const platform = process.platform as SupportedPlatform
  const mode = options?.resolvedPermissions.mode ?? 'unrestricted'

  const sandboxWrapped = !!(
    server.transportType === 'stdio'
    && options
    && options.resolvedPermissions.config.applyToMCP
    && options.resolvedPermissions.mode === 'sandbox'
    && isSandboxRuntimeSupported(platform)
  )

  const sandboxConfigHash = sandboxWrapped
    ? sha256(JSON.stringify(options!.resolvedPermissions.config))
    : ''

  return {
    mode,
    sandboxWrapped,
    sandboxConfigHash,
    transportType: server.transportType,
    command: server.command,
    args: server.args,
    env: server.env,
    cwd: effectiveCwd,
    url: server.url,
    headers: server.headers,
  }
}

function fingerprintEquals(a: MCPPoolFingerprint, b: MCPPoolFingerprint): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// ── Pool Entry ─────────────────────────────────────────────────

type MCPPoolStatus = 'connecting' | 'active' | 'error'

/** Result from getTools() — includes tools and optional error for callers to surface warnings. */
export interface MCPGetToolsResult {
  tools: ToolSet
  /** If set, indicates the connection failed. tools will be empty. */
  error?: string
}

interface MCPPoolEntry {
  /** Current connection status */
  status: MCPPoolStatus
  /** Fingerprint at time of connection creation */
  fingerprint: MCPPoolFingerprint
  /** Cached tool set from this MCP server */
  tools: ToolSet
  /** Client handle for cleanup (close connection) */
  client: { close: () => Promise<void> }
  /** Timestamp of last getTools() access — for idle timeout */
  lastUsedAt: number
  /** Connection creation promise — used to deduplicate concurrent connect attempts */
  connectPromise: Promise<MCPGetToolsResult> | null
}

// ── Sandbox Helpers (moved from mcp.ts) ────────────────────────

/**
 * Build a shell-safe command string from command + args.
 * Escapes arguments that contain shell-special characters.
 */
function buildShellCommand(command: string, args?: string[]): string {
  const parts = [shellEscape(command)]
  if (args) {
    parts.push(...args.map(shellEscape))
  }
  return parts.join(' ')
}

/**
 * Shell-escape a string. Simple strings pass through; others get single-quoted.
 */
function shellEscape(s: string): string {
  if (/^[a-zA-Z0-9._\-/=:@]+$/.test(s)) return s
  return `'${s.replace(/'/g, "'\\''")}'`
}

/**
 * Bridge PermissionsConfig to SandboxConfig for sandboxPool.getHandle().
 */
function permissionsToSandboxConfig(pc: PermissionsConfig): SandboxConfig {
  return {
    filesystem: {
      allowWrite: pc.allowWrite,
      denyRead: pc.denyRead,
      denyWrite: pc.denyWrite,
      allowGitConfig: false,
    },
    network: {
      allowedDomains: pc.networkRestrictionsEnabled ? pc.allowedDomains : undefined,
    },
    enablePython: true,
    deniedCommands: pc.deniedCommands,
  }
}

// ── MCPPool ────────────────────────────────────────────────────

/**
 * Module-level singleton that manages persistent MCP server connections.
 *
 * Data structure: Map<ProjectId, Map<serverName, MCPPoolEntry>>
 *
 * Design principles:
 * - Lazy loading: connections created on first use, not at startup
 * - Fingerprint invalidation: config changes detected passively on each access
 * - Idle timeout: periodic scan removes unused connections
 * - Crash recovery: connection failures detected on next use, lazy rebuild
 */
export class MCPPool {
  private readonly pool = new Map<ProjectId, Map<string, MCPPoolEntry>>()
  private idleTimer: ReturnType<typeof setInterval> | null = null

  // ── Public API ──────────────────────────────────────────

  /**
   * Get tools for a single MCP server, creating/reusing a pooled connection.
   *
   * Logic:
   * 1. Compute current fingerprint from server config + options
   * 2. Look up existing entry by (projectId, serverName)
   * 3. If entry exists AND fingerprint matches → return cached tools, update lastUsedAt
   * 4. If entry exists AND fingerprint mismatches → close old, create new
   * 5. If no entry → create new connection
   *
   * @returns Tools from this server, plus optional error if connection failed
   */
  async getTools(
    server: MCPServerConfig,
    options: MCPLoadOptions | undefined,
  ): Promise<MCPGetToolsResult> {
    const projectId = options?.projectId ?? ('' as ProjectId)
    const effectiveCwd = server.cwd || options?.workspaceDir || undefined
    const newFingerprint = computeFingerprint(server, options, effectiveCwd)

    const serverMap = this.getOrCreateProjectMap(projectId)
    const existing = serverMap.get(server.name)

    if (existing) {
      // If a connection attempt is in progress, await it
      if (existing.status === 'connecting' && existing.connectPromise) {
        return existing.connectPromise
      }

      if (existing.status === 'active') {
        if (fingerprintEquals(existing.fingerprint, newFingerprint)) {
          // Cache hit — tools are immutable per connection
          existing.lastUsedAt = Date.now()
          return { tools: existing.tools }
        }
        // Fingerprint mismatch → close old connection
        log.debug(
          { projectId, serverName: server.name },
          'MCP pool: fingerprint mismatch, recreating connection',
        )
        await this.closeEntry(existing)
        serverMap.delete(server.name)
      }
    }

    // Create new connection
    return this.createEntry(projectId, server, options, newFingerprint, effectiveCwd)
  }

  /**
   * Invalidate (close + remove) a specific server's connection.
   * The connection will be lazily recreated on next getTools() call.
   */
  async invalidateServer(projectId: ProjectId, serverName: string): Promise<void> {
    const serverMap = this.pool.get(projectId)
    if (!serverMap) return

    const entry = serverMap.get(serverName)
    if (entry) {
      await this.closeEntry(entry)
      serverMap.delete(serverName)
      if (serverMap.size === 0) this.pool.delete(projectId)
      log.debug({ projectId, serverName }, 'MCP pool: server invalidated')
    }
  }

  /**
   * Invalidate all connections for a project.
   * Used when project is deleted, permission mode changes, etc.
   */
  async invalidateProject(projectId: ProjectId): Promise<void> {
    const serverMap = this.pool.get(projectId)
    if (!serverMap) return

    const closePromises: Promise<void>[] = []
    for (const entry of serverMap.values()) {
      closePromises.push(this.closeEntry(entry))
    }
    await Promise.allSettled(closePromises)
    this.pool.delete(projectId)
    log.debug({ projectId }, 'MCP pool: project invalidated')
  }

  /**
   * Graceful shutdown: close all connections, stop idle timer.
   * Called on server SIGTERM.
   */
  async shutdown(): Promise<void> {
    this.stopIdleScanner()

    const closePromises: Promise<void>[] = []
    for (const serverMap of this.pool.values()) {
      for (const entry of serverMap.values()) {
        closePromises.push(this.closeEntry(entry))
      }
    }
    await Promise.allSettled(closePromises)
    this.pool.clear()
    log.info('MCP pool: shutdown complete')
  }

  /**
   * Start the idle timeout scanner.
   * Called once at server startup.
   */
  startIdleScanner(
    intervalMs = DEFAULT_IDLE_SCAN_INTERVAL_MS,
    maxIdleMs = DEFAULT_MAX_IDLE_MS,
  ): void {
    this.stopIdleScanner()
    this.idleTimer = setInterval(() => {
      this.scanIdleConnections(maxIdleMs)
    }, intervalMs)
    // Don't keep process alive just for idle scanning
    this.idleTimer.unref()
  }

  /**
   * Stop the idle timeout scanner.
   */
  stopIdleScanner(): void {
    if (this.idleTimer) {
      clearInterval(this.idleTimer)
      this.idleTimer = null
    }
  }

  /**
   * Test connectivity to an MCP server without adding it to the pool.
   * Creates a temporary connection, lists tools, then closes immediately.
   *
   * @returns Object with ok, toolCount, and optional error message
   */
  async testConnection(
    server: MCPServerConfig,
    options?: MCPLoadOptions,
  ): Promise<{ ok: boolean; toolCount: number; error?: string }> {
    const effectiveCwd = server.cwd || options?.workspaceDir || undefined
    const fingerprint = computeFingerprint(server, options, effectiveCwd)
    let stderrCapture: StderrCapture | null = null

    try {
      const result = await this.buildTransport(server, options, fingerprint, effectiveCwd)
      if (!result) {
        return { ok: false, toolCount: 0, error: 'Missing required configuration (command or url)' }
      }

      stderrCapture = result.stderrCapture
      const client = await createMCPClient({ transport: result.transport })
      const tools = await client.tools()
      const toolCount = Object.keys(tools).length
      await client.close()

      return { ok: true, toolCount }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown connection error'
      const stderrText = stderrCapture?.getText() ?? ''
      const enhancedMessage = stderrText
        ? `${message}\n\nMCP server stderr:\n${stderrText}`
        : message

      log.warn({ err, serverName: server.name }, 'MCP connectivity test failed')
      return { ok: false, toolCount: 0, error: enhancedMessage }
    }
  }

  /** Total number of active connections across all projects. */
  getConnectionCount(): number {
    let count = 0
    for (const serverMap of this.pool.values()) {
      count += serverMap.size
    }
    return count
  }

  // ── Internal ────────────────────────────────────────────

  private getOrCreateProjectMap(projectId: ProjectId): Map<string, MCPPoolEntry> {
    let serverMap = this.pool.get(projectId)
    if (!serverMap) {
      serverMap = new Map()
      this.pool.set(projectId, serverMap)
    }
    return serverMap
  }

  private async createEntry(
    projectId: ProjectId,
    server: MCPServerConfig,
    options: MCPLoadOptions | undefined,
    fingerprint: MCPPoolFingerprint,
    effectiveCwd: string | undefined,
  ): Promise<MCPGetToolsResult> {
    const entry: MCPPoolEntry = {
      status: 'connecting',
      fingerprint,
      tools: {},
      client: { close: async () => {} },
      lastUsedAt: Date.now(),
      connectPromise: null,
    }

    const serverMap = this.getOrCreateProjectMap(projectId)
    serverMap.set(server.name, entry)

    // Create connection promise for deduplication
    const connectPromise = this.doConnect(projectId, server, options, fingerprint, effectiveCwd, entry)
    entry.connectPromise = connectPromise

    return connectPromise
  }

  private async doConnect(
    projectId: ProjectId,
    server: MCPServerConfig,
    options: MCPLoadOptions | undefined,
    fingerprint: MCPPoolFingerprint,
    effectiveCwd: string | undefined,
    entry: MCPPoolEntry,
  ): Promise<MCPGetToolsResult> {
    let stderrCapture: StderrCapture | null = null

    try {
      const result = await this.buildTransport(server, options, fingerprint, effectiveCwd)
      if (!result) {
        // Missing required config (command or url)
        const serverMap = this.pool.get(projectId)
        if (serverMap) {
          serverMap.delete(server.name)
          if (serverMap.size === 0) this.pool.delete(projectId)
        }
        return { tools: {}, error: 'Missing required configuration (command or url)' }
      }

      stderrCapture = result.stderrCapture
      const client = await createMCPClient({ transport: result.transport })
      const rawTools = await client.tools()

      entry.client = client
      entry.tools = rawTools
      entry.status = 'active'
      entry.lastUsedAt = Date.now()
      entry.connectPromise = null

      log.debug(
        { projectId, serverName: server.name, toolCount: Object.keys(rawTools).length },
        'MCP pool: connection established',
      )

      return { tools: rawTools }
    } catch (err) {
      log.error({ err, projectId, serverName: server.name }, 'MCP pool: connection failed')
      const message = err instanceof Error ? err.message : 'Unknown connection error'

      // Enhance error message with captured stderr
      const stderrText = stderrCapture?.getText() ?? ''
      const enhancedMessage = stderrText
        ? `${message}\n\nMCP server stderr:\n${stderrText}`
        : message

      // Remove failed entry
      const serverMap = this.pool.get(projectId)
      if (serverMap) {
        serverMap.delete(server.name)
        if (serverMap.size === 0) this.pool.delete(projectId)
      }
      return { tools: {}, error: enhancedMessage }
    }
  }

  private async buildTransport(
    server: MCPServerConfig,
    options: MCPLoadOptions | undefined,
    fingerprint: MCPPoolFingerprint,
    effectiveCwd: string | undefined,
  ): Promise<BuildTransportResult | null> {
    if (server.transportType === 'stdio') {
      if (!server.command) {
        log.warn({ name: server.name }, 'stdio MCP server missing command, skipping')
        return null
      }

      let effectiveCommand = server.command
      let effectiveArgs = server.args ?? []

      // Sandbox wrapping for stdio
      if (fingerprint.sandboxWrapped && options) {
        try {
          const sandboxConfig = permissionsToSandboxConfig(options.resolvedPermissions.config)
          const handle = await sandboxPool.getHandle(options.projectId, {
            mode: 'sandbox',
            sandbox: sandboxConfig,
            usesDedicatedWorker: true,
          })

          const fullCommand = buildShellCommand(server.command, server.args)
          const wrappedCommand = await handle.wrapWithSandbox(fullCommand)

          log.info(
            {
              name: server.name,
              originalCommand: server.command,
              originalArgs: server.args,
              wrappedCommand,
            },
            'MCP server command wrapped with sandbox',
          )

          effectiveCommand = 'bash'
          effectiveArgs = ['-c', wrappedCommand]
        } catch (err) {
          log.warn(
            { err, name: server.name },
            'failed to wrap MCP command with sandbox, proceeding without sandbox',
          )
        }
      }

      log.info(
        { name: server.name, command: effectiveCommand, args: effectiveArgs, cwd: effectiveCwd },
        'starting stdio MCP server',
      )

      const stderrCapture = new StderrCapture()
      const { Experimental_StdioMCPTransport } = await import('@ai-sdk/mcp/mcp-stdio')
      const transport = new Experimental_StdioMCPTransport({
        command: effectiveCommand,
        args: effectiveArgs,
        env: server.env ? { ...process.env, ...server.env } as Record<string, string> : undefined,
        cwd: effectiveCwd,
        stderr: 'pipe',
      })

      // Intercept start() to capture stderr from the spawned child process.
      // The private `process` field is set inside start() after spawn().
      if (typeof transport.start === 'function') {
        const originalStart = transport.start.bind(transport)
        transport.start = async function (this: typeof transport) {
          await originalStart()
          const proc = (this as unknown as { process?: ChildProcess }).process
          if (proc) stderrCapture.attach(proc)
        }
      }

      return { transport, stderrCapture }
    }

    if (server.transportType === 'http' || server.transportType === 'sse') {
      if (!server.url) {
        log.warn({ name: server.name, type: server.transportType }, 'MCP server missing url, skipping')
        return null
      }

      log.info(
        { name: server.name, type: server.transportType, url: server.url },
        'connecting to remote MCP server',
      )

      return {
        transport: {
          type: server.transportType,
          url: server.url,
          headers: server.headers,
        },
        stderrCapture: null,
      }
    }

    log.warn({ name: server.name, type: server.transportType }, 'unknown MCP transport type, skipping')
    return null
  }

  private async closeEntry(entry: MCPPoolEntry): Promise<void> {
    try {
      await entry.client.close()
    } catch {
      // Ignore close errors (process may already be dead)
    }
  }

  private scanIdleConnections(maxIdleMs: number): void {
    const now = Date.now()
    for (const [projectId, serverMap] of this.pool) {
      for (const [serverName, entry] of serverMap) {
        if (entry.status === 'active' && now - entry.lastUsedAt > maxIdleMs) {
          log.debug(
            { projectId, serverName, idleMs: now - entry.lastUsedAt },
            'closing idle MCP connection',
          )
          this.closeEntry(entry).catch(() => {})
          serverMap.delete(serverName)
        }
      }
      // Clean up empty project maps
      if (serverMap.size === 0) {
        this.pool.delete(projectId)
      }
    }
  }
}

// ── Module-Level Singleton ─────────────────────────────────────

/** Global MCPPool instance — one per server process. */
export const mcpPool = new MCPPool()
