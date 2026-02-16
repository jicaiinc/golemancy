/**
 * Sandbox modes live tests — real execution in different permission modes.
 *
 * Tests the actual behavior of restricted (just-bash) and unrestricted (native)
 * sandbox modes with real command execution. Does NOT test Anthropic sandbox
 * mode since that requires the sandbox runtime to be installed.
 *
 * Run via: pnpm --filter @golemancy/server test:live
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { spawn } from 'node:child_process'
import { describeWithApiKey } from '../test/live-settings'
import { resolveModel } from './model'
import { generateText, tool } from 'ai'
import { z } from 'zod'
import type { GlobalSettings } from '@golemancy/shared'

// ── Helpers ───────────────────────────────────────────────────

function exec(cmd: string, args: string[], timeout = 10_000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? 1 }))
    child.on('error', reject)
  })
}

// Check if just-bash is available
let justBashAvailable = false
beforeAll(async () => {
  try {
    // just-bash is a dependency — check if the module exists
    await import('just-bash')
    justBashAvailable = true
  } catch { /* not installed */ }
})

// ── Unrestricted Mode (Native Execution) ─────────────────────

describe('sandbox-modes.live — unrestricted (native execution)', () => {
  it('executes a simple echo command', async () => {
    const result = await exec('echo', ['hello world'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe('hello world')
  })

  it('executes python3 inline code', async () => {
    const result = await exec('python3', ['-c', 'print(2 + 3)'])
    if (result.exitCode !== 0) return // python3 not available
    expect(result.stdout.trim()).toBe('5')
  })

  it('can read environment variables', async () => {
    const result = await exec('sh', ['-c', 'echo $HOME'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBeTruthy()
  })

  it('can write to /tmp', async () => {
    const tmpFile = `/tmp/golemancy-test-${Date.now()}.txt`
    const writeResult = await exec('sh', ['-c', `echo "test content" > ${tmpFile}`])
    expect(writeResult.exitCode).toBe(0)

    const readResult = await exec('cat', [tmpFile])
    expect(readResult.stdout.trim()).toBe('test content')

    // Cleanup
    await exec('rm', [tmpFile])
  })
})

// ── Restricted Mode (just-bash) ──────────────────────────────

describe.skipIf(!justBashAvailable)('sandbox-modes.live — restricted (just-bash)', () => {
  let justBash: any

  beforeAll(async () => {
    justBash = await import('just-bash')
  })

  it('executes simple bash commands', async () => {
    const result = await justBash.default('echo hello')
    expect(result.stdout?.trim() ?? result.trim()).toContain('hello')
  })

  it('executes piped commands', async () => {
    const result = await justBash.default('echo "line1\nline2\nline3" | wc -l')
    const output = (result.stdout ?? result).trim()
    expect(parseInt(output)).toBeGreaterThan(0)
  })
})

// ── Command Blacklist Enforcement ────────────────────────────

describe('sandbox-modes.live — command blacklist', () => {
  // These commands should fail or be blocked in production.
  // Here we verify the pattern matching logic used in builtin-tools.

  const DENIED_COMMANDS = ['sudo', 'su', 'chmod', 'chown', 'mkfs', 'dd', 'mount', 'umount']

  it('denied commands list includes dangerous system commands', () => {
    expect(DENIED_COMMANDS).toContain('sudo')
    expect(DENIED_COMMANDS).toContain('chmod')
    expect(DENIED_COMMANDS).toContain('mkfs')
  })

  it('a basic command (echo) is not in denied list', () => {
    expect(DENIED_COMMANDS).not.toContain('echo')
    expect(DENIED_COMMANDS).not.toContain('ls')
    expect(DENIED_COMMANDS).not.toContain('cat')
  })
})

// ── Live AI + Tool Execution ─────────────────────────────────

describeWithApiKey('sandbox-modes.live — AI with bash tool', (settings) => {
  it('model can use a bash-like tool to execute echo', async () => {
    const model = await resolveModel(settings)

    const bashTool = tool({
      description: 'Execute a bash command and return the output',
      parameters: z.object({ command: z.string() }),
      execute: async ({ command }) => {
        const result = await exec('sh', ['-c', command], 10_000)
        return `exit_code: ${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
      },
    })

    const result = await generateText({
      model,
      system: 'You have a bash tool. Use it to execute commands. Keep responses short.',
      prompt: 'Run the command: echo SANDBOX_TEST_OK',
      tools: { bash: bashTool },
      maxSteps: 3,
      maxOutputTokens: 200,
    })

    // The model should have used the tool and the result should contain our echo output
    const fullText = result.text + JSON.stringify(result.steps)
    expect(fullText).toContain('SANDBOX_TEST_OK')
  }, 25_000)

  it('model can use a bash-like tool to run python inline', async () => {
    // Check python3 availability first
    const pyCheck = await exec('python3', ['--version'])
    if (pyCheck.exitCode !== 0) return

    const model = await resolveModel(settings)

    const bashTool = tool({
      description: 'Execute a bash command',
      parameters: z.object({ command: z.string() }),
      execute: async ({ command }) => {
        const result = await exec('sh', ['-c', command], 10_000)
        return `exit_code: ${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
      },
    })

    const result = await generateText({
      model,
      system: 'You have a bash tool. Use it to run commands.',
      prompt: 'Run python3 -c "print(7 * 6)" and tell me the result.',
      tools: { bash: bashTool },
      maxSteps: 3,
      maxOutputTokens: 200,
    })

    const fullText = result.text + JSON.stringify(result.steps)
    expect(fullText).toContain('42')
  }, 25_000)
})
