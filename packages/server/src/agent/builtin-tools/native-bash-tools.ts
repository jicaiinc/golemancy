import path from 'node:path'
import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { Sandbox, CommandResult } from 'bash-tool'
import type { SupportedPlatform } from '@golemancy/shared'

// ── Constants ────────────────────────────────────────────────

/** Match bash-tool's default (30 KB) */
const MAX_OUTPUT_LENGTH = 30_000

// ── Types ────────────────────────────────────────────────────

export interface NativeBashToolsOptions {
  sandbox: Sandbox
  workspaceDir: string
  platform?: SupportedPlatform
}

// ── Tool Descriptions ────────────────────────────────────────

function buildBashDescription(workspaceDir: string, isWin: boolean): string {
  const lines = [
    'Execute commands in the workspace environment.',
    '',
    `WORKING DIRECTORY: ${workspaceDir}`,
    'All commands execute from this directory. Use relative paths from here.',
    '',
    'Common operations:',
  ]

  if (isWin) {
    lines.push(
      '  dir /b              # List files',
      '  dir /s /b *.ts      # Find files by pattern',
      '  findstr /s /i "pattern" *.* # Search file contents',
      '  type <file>         # View file contents',
    )
  } else {
    lines.push(
      '  ls -la              # List files with details',
      '  find . -name "*.ts" # Find files by pattern',
      '  grep -r "pattern" . # Search file contents',
      '  cat <file>          # View file contents',
    )
  }

  return lines.join('\n')
}

// ── Output Truncation ────────────────────────────────────────

function truncateOutput(output: string, maxLength: number, streamName: string): string {
  if (output.length <= maxLength) return output
  const truncated = output.length - maxLength
  return `${output.slice(0, maxLength)}\n\n[${streamName} truncated: ${truncated} characters removed]`
}

// ── Factory ──────────────────────────────────────────────────

/**
 * Create platform-native bash/readFile/writeFile tools that bypass bash-tool.
 *
 * Used for sandbox and unrestricted modes where the sandbox operates on the
 * real filesystem. Path resolution uses Node's platform-native `path.resolve`
 * instead of bash-tool's `path.posix.resolve`, which is critical for Windows
 * where drive-letter prefixes (C:\) must be recognized as absolute paths.
 *
 * Restricted mode continues using bash-tool directly (POSIX virtual FS).
 */
export function createNativeBashTools(options: NativeBashToolsOptions): { tools: ToolSet } {
  const { sandbox, workspaceDir, platform } = options
  const isWin = platform === 'win32'

  const tools: ToolSet = {
    bash: tool({
      description: buildBashDescription(workspaceDir, isWin),
      inputSchema: z.object({
        command: z.string().describe('The command to execute'),
      }),
      execute: async ({ command }): Promise<CommandResult> => {
        // cd /d handles cross-drive navigation on Windows; plain cd on POSIX
        const cdPrefix = isWin ? `cd /d "${workspaceDir}"` : `cd "${workspaceDir}"`
        const fullCommand = `${cdPrefix} && ${command}`

        let result = await sandbox.executeCommand(fullCommand)
        result = {
          ...result,
          stdout: truncateOutput(result.stdout, MAX_OUTPUT_LENGTH, 'stdout'),
          stderr: truncateOutput(result.stderr, MAX_OUTPUT_LENGTH, 'stderr'),
        }
        return result
      },
    }),

    readFile: tool({
      description: 'Read the contents of a file.',
      inputSchema: z.object({
        path: z.string().describe('The path to the file to read'),
      }),
      execute: async ({ path: filePath }) => {
        const resolvedPath = path.resolve(workspaceDir, filePath)
        const content = await sandbox.readFile(resolvedPath)
        return { content }
      },
    }),

    writeFile: tool({
      description: 'Write content to a file. Creates parent directories if needed.',
      inputSchema: z.object({
        path: z.string().describe('The path where the file should be written'),
        content: z.string().describe('The content to write to the file'),
      }),
      execute: async ({ path: filePath, content }) => {
        const resolvedPath = path.resolve(workspaceDir, filePath)
        await sandbox.writeFiles([{ path: resolvedPath, content }])
        return { success: true }
      },
    }),
  }

  return { tools }
}
