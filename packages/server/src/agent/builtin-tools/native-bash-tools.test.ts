import { describe, it, expect, vi } from 'vitest'
import path from 'node:path'
import { createNativeBashTools } from './native-bash-tools'
import type { Sandbox, CommandResult } from 'bash-tool'

function createMockSandbox(): Sandbox {
  return {
    executeCommand: vi.fn<[string], Promise<CommandResult>>().mockResolvedValue({
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    }),
    readFile: vi.fn<[string], Promise<string>>().mockResolvedValue('file content'),
    writeFiles: vi.fn<[Array<{ path: string; content: string | Buffer }>], Promise<void>>().mockResolvedValue(undefined),
  }
}

describe('createNativeBashTools', () => {
  it('returns bash, readFile, writeFile tools', () => {
    const sandbox = createMockSandbox()
    const { tools } = createNativeBashTools({ sandbox, workspaceDir: '/workspace' })

    expect(tools).toHaveProperty('bash')
    expect(tools).toHaveProperty('readFile')
    expect(tools).toHaveProperty('writeFile')
  })

  describe('bash tool', () => {
    it('prepends cd on POSIX', async () => {
      const sandbox = createMockSandbox()
      const { tools } = createNativeBashTools({ sandbox, workspaceDir: '/home/user/workspace', platform: 'darwin' })

      await (tools.bash as any).execute({ command: 'ls -la' }, { toolCallId: 't1' })

      expect(sandbox.executeCommand).toHaveBeenCalledWith('cd "/home/user/workspace" && ls -la')
    })

    it('prepends cd /d on Windows', async () => {
      const sandbox = createMockSandbox()
      const { tools } = createNativeBashTools({ sandbox, workspaceDir: 'C:\\Users\\test\\workspace', platform: 'win32' })

      await (tools.bash as any).execute({ command: 'dir' }, { toolCallId: 't1' })

      expect(sandbox.executeCommand).toHaveBeenCalledWith('cd /d "C:\\Users\\test\\workspace" && dir')
    })

    it('truncates stdout at 30KB', async () => {
      const sandbox = createMockSandbox()
      const longOutput = 'x'.repeat(40_000)
      vi.mocked(sandbox.executeCommand).mockResolvedValue({ stdout: longOutput, stderr: '', exitCode: 0 })

      const { tools } = createNativeBashTools({ sandbox, workspaceDir: '/workspace' })
      const result = await (tools.bash as any).execute({ command: 'echo long' }, { toolCallId: 't1' }) as CommandResult

      expect(result.stdout.length).toBeLessThan(longOutput.length)
      expect(result.stdout).toContain('[stdout truncated:')
    })

    it('truncates stderr at 30KB', async () => {
      const sandbox = createMockSandbox()
      const longErr = 'e'.repeat(40_000)
      vi.mocked(sandbox.executeCommand).mockResolvedValue({ stdout: '', stderr: longErr, exitCode: 1 })

      const { tools } = createNativeBashTools({ sandbox, workspaceDir: '/workspace' })
      const result = await (tools.bash as any).execute({ command: 'fail' }, { toolCallId: 't1' }) as CommandResult

      expect(result.stderr).toContain('[stderr truncated:')
    })

    it('includes Windows commands in description on win32', () => {
      const sandbox = createMockSandbox()
      const { tools } = createNativeBashTools({ sandbox, workspaceDir: 'C:\\workspace', platform: 'win32' })

      const desc = (tools.bash as any).description as string
      expect(desc).toContain('dir')
      expect(desc).toContain('findstr')
      expect(desc).toContain('type')
      expect(desc).not.toContain('ls -la')
      expect(desc).not.toContain('grep')
    })

    it('includes POSIX commands in description on darwin', () => {
      const sandbox = createMockSandbox()
      const { tools } = createNativeBashTools({ sandbox, workspaceDir: '/workspace', platform: 'darwin' })

      const desc = (tools.bash as any).description as string
      expect(desc).toContain('ls -la')
      expect(desc).toContain('grep')
      expect(desc).not.toContain('findstr')
    })
  })

  describe('readFile tool', () => {
    it('resolves relative path against workspaceDir', async () => {
      const sandbox = createMockSandbox()
      const { tools } = createNativeBashTools({ sandbox, workspaceDir: '/home/user/workspace' })

      const result = await (tools.readFile as any).execute({ path: 'src/index.ts' }, { toolCallId: 't1' })

      expect(sandbox.readFile).toHaveBeenCalledWith(path.resolve('/home/user/workspace', 'src/index.ts'))
      expect(result).toEqual({ content: 'file content' })
    })

    it('uses absolute path as-is', async () => {
      const sandbox = createMockSandbox()
      const { tools } = createNativeBashTools({ sandbox, workspaceDir: '/home/user/workspace' })

      await (tools.readFile as any).execute({ path: '/tmp/other.txt' }, { toolCallId: 't1' })

      expect(sandbox.readFile).toHaveBeenCalledWith('/tmp/other.txt')
    })
  })

  describe('writeFile tool', () => {
    it('resolves relative path and writes content', async () => {
      const sandbox = createMockSandbox()
      const { tools } = createNativeBashTools({ sandbox, workspaceDir: '/home/user/workspace' })

      const result = await (tools.writeFile as any).execute(
        { path: 'out/result.txt', content: 'hello' },
        { toolCallId: 't1' },
      )

      expect(sandbox.writeFiles).toHaveBeenCalledWith([
        { path: path.resolve('/home/user/workspace', 'out/result.txt'), content: 'hello' },
      ])
      expect(result).toEqual({ success: true })
    })

    it('uses absolute path as-is', async () => {
      const sandbox = createMockSandbox()
      const { tools } = createNativeBashTools({ sandbox, workspaceDir: '/home/user/workspace' })

      await (tools.writeFile as any).execute(
        { path: '/tmp/out.txt', content: 'data' },
        { toolCallId: 't1' },
      )

      expect(sandbox.writeFiles).toHaveBeenCalledWith([
        { path: '/tmp/out.txt', content: 'data' },
      ])
    })
  })
})
