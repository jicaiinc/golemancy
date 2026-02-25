import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processSdkMessage, type SdkMessage, type SseAdapterState } from './sse-adapter'

function makeState(overrides?: Partial<SseAdapterState>): SseAdapterState {
  return {
    sessionId: undefined,
    inputTokens: 0,
    outputTokens: 0,
    duration: 0,
    textPartCounter: 0,
    responseText: '',
    ...overrides,
  }
}

function createMockWriter() {
  const writes: unknown[] = []
  return {
    write: vi.fn((event: unknown) => writes.push(event)),
    writes,
  }
}

describe('processSdkMessage', () => {
  let writer: ReturnType<typeof createMockWriter>

  beforeEach(() => {
    writer = createMockWriter()
  })

  // ── System Messages ──

  describe('system init message', () => {
    it('extracts session_id and emits data-session event', () => {
      const msg: SdkMessage = {
        type: 'system',
        subtype: 'init',
        session_id: 'sess-123',
        model: 'claude-sonnet-4-20250514',
        tools: ['Bash', 'Read'],
        mcp_servers: [{ name: 'fs', status: 'connected' }],
        permissionMode: 'default',
      }

      const state = processSdkMessage(msg, writer as any, makeState())

      expect(state.sessionId).toBe('sess-123')
      expect(writer.write).toHaveBeenCalledWith({
        type: 'data-session',
        data: {
          sessionId: 'sess-123',
          model: 'claude-sonnet-4-20250514',
          tools: ['Bash', 'Read'],
          mcpServers: [{ name: 'fs', status: 'connected' }],
          permissionMode: 'default',
        },
      })
    })

    it('does not emit session event when no session_id', () => {
      const msg: SdkMessage = { type: 'system', subtype: 'init' }
      const state = processSdkMessage(msg, writer as any, makeState())
      expect(state.sessionId).toBeUndefined()
      expect(writer.write).not.toHaveBeenCalled()
    })
  })

  describe('system compact_boundary message', () => {
    it('emits data-compact completed event', () => {
      const msg: SdkMessage = {
        type: 'system',
        subtype: 'compact_boundary',
        compact_metadata: { trigger: 'auto', pre_tokens: 80000 },
      }

      processSdkMessage(msg, writer as any, makeState())

      expect(writer.write).toHaveBeenCalledWith({
        type: 'data-compact',
        data: {
          status: 'completed',
          trigger: 'auto',
          preTokens: 80000,
        },
      })
    })
  })

  describe('system status message', () => {
    it('emits data-compact started event when status is "compacting"', () => {
      const msg: SdkMessage = {
        type: 'system',
        subtype: 'status',
        status: 'compacting',
      }

      processSdkMessage(msg, writer as any, makeState())

      expect(writer.write).toHaveBeenCalledWith({
        type: 'data-compact',
        data: { status: 'started' },
      })
    })

    it('does not emit for non-compacting status', () => {
      const msg: SdkMessage = {
        type: 'system',
        subtype: 'status',
        status: 'thinking',
      }

      processSdkMessage(msg, writer as any, makeState())
      expect(writer.write).not.toHaveBeenCalled()
    })
  })

  describe('system task_started message', () => {
    it('emits data-subagent-started event', () => {
      const msg: SdkMessage = {
        type: 'system',
        subtype: 'task_started',
        task_id: 'task-1',
        tool_use_id: 'tu-1',
        description: 'Research task',
        task_type: 'research',
      }

      processSdkMessage(msg, writer as any, makeState())

      expect(writer.write).toHaveBeenCalledWith({
        type: 'data-subagent-started',
        data: {
          taskId: 'task-1',
          toolUseId: 'tu-1',
          description: 'Research task',
          taskType: 'research',
        },
      })
    })
  })

  describe('system task_progress message', () => {
    it('emits data-subagent-progress event', () => {
      const msg: SdkMessage = {
        type: 'system',
        subtype: 'task_progress',
        task_id: 'task-1',
        tool_use_id: 'tu-1',
        description: 'Running code',
        last_tool_name: 'Bash',
      }

      processSdkMessage(msg, writer as any, makeState())

      expect(writer.write).toHaveBeenCalledWith({
        type: 'data-subagent-progress',
        data: {
          taskId: 'task-1',
          toolUseId: 'tu-1',
          description: 'Running code',
          lastToolName: 'Bash',
        },
      })
    })
  })

  describe('system task_notification message', () => {
    it('emits data-subagent-completed event', () => {
      const msg: SdkMessage = {
        type: 'system',
        subtype: 'task_notification',
        task_id: 'task-1',
        tool_use_id: 'tu-1',
        status: 'completed',
        summary: 'Task done',
      }

      processSdkMessage(msg, writer as any, makeState())

      expect(writer.write).toHaveBeenCalledWith({
        type: 'data-subagent-completed',
        data: {
          taskId: 'task-1',
          toolUseId: 'tu-1',
          status: 'completed',
          summary: 'Task done',
        },
      })
    })
  })

  // ── Stream Events ──

  describe('stream_event: content_block_start text', () => {
    it('emits text-start for main agent', () => {
      const msg: SdkMessage = {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          content_block: { type: 'text' },
        },
      }

      const state = processSdkMessage(msg, writer as any, makeState())

      expect(writer.write).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'text-start' }),
      )
      expect(state.currentTextId).toBeDefined()
    })

    it('does not emit text-start for sub-agent (parent_tool_use_id set)', () => {
      const msg: SdkMessage = {
        type: 'stream_event',
        parent_tool_use_id: 'tu-parent',
        event: {
          type: 'content_block_start',
          content_block: { type: 'text' },
        },
      }

      processSdkMessage(msg, writer as any, makeState())
      expect(writer.write).not.toHaveBeenCalled()
    })
  })

  describe('stream_event: content_block_start tool_use', () => {
    it('emits tool-input-start for main agent', () => {
      const msg: SdkMessage = {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          content_block: { type: 'tool_use', name: 'Bash', id: 'toolcall-1' },
        },
      }

      processSdkMessage(msg, writer as any, makeState())

      expect(writer.write).toHaveBeenCalledWith({
        type: 'tool-input-start',
        toolCallId: 'toolcall-1',
        toolName: 'Bash',
      })
    })

    it('emits data-subagent-progress for sub-agent tool_use', () => {
      const msg: SdkMessage = {
        type: 'stream_event',
        parent_tool_use_id: 'tu-parent',
        event: {
          type: 'content_block_start',
          content_block: { type: 'tool_use', name: 'Read', id: 'tc-2' },
        },
      }

      processSdkMessage(msg, writer as any, makeState())

      expect(writer.write).toHaveBeenCalledWith({
        type: 'data-subagent-progress',
        data: {
          parentToolUseId: 'tu-parent',
          event: 'tool_start',
          toolName: 'Read',
          toolUseId: 'tc-2',
        },
      })
    })
  })

  describe('stream_event: content_block_delta text_delta', () => {
    it('emits text-delta and accumulates responseText for main agent', () => {
      const msg: SdkMessage = {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Hello' },
        },
      }

      const state = processSdkMessage(msg, writer as any, makeState({ currentTextId: 'part-1' }))

      expect(writer.write).toHaveBeenCalledWith({
        type: 'text-delta',
        delta: 'Hello',
        id: 'part-1',
      })
      expect(state.responseText).toBe('Hello')
    })

    it('emits data-subagent-delta for sub-agent text', () => {
      const msg: SdkMessage = {
        type: 'stream_event',
        parent_tool_use_id: 'tu-parent',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Sub text' },
        },
      }

      processSdkMessage(msg, writer as any, makeState())

      expect(writer.write).toHaveBeenCalledWith({
        type: 'data-subagent-delta',
        data: {
          parentToolUseId: 'tu-parent',
          text: 'Sub text',
        },
      })
    })
  })

  describe('stream_event: content_block_delta input_json_delta', () => {
    it('emits data-subagent-progress for sub-agent input_json_delta', () => {
      const msg: SdkMessage = {
        type: 'stream_event',
        parent_tool_use_id: 'tu-parent',
        event: {
          type: 'content_block_delta',
          delta: { type: 'input_json_delta', partial_json: '{"key":' },
        },
      }

      processSdkMessage(msg, writer as any, makeState())

      expect(writer.write).toHaveBeenCalledWith({
        type: 'data-subagent-progress',
        data: {
          parentToolUseId: 'tu-parent',
          event: 'tool_input_delta',
          partialJson: '{"key":',
        },
      })
    })
  })

  describe('stream_event: content_block_stop', () => {
    it('emits text-end for main agent when currentTextId exists', () => {
      const msg: SdkMessage = {
        type: 'stream_event',
        event: { type: 'content_block_stop' },
      }

      const state = processSdkMessage(msg, writer as any, makeState({ currentTextId: 'part-1' }))

      expect(writer.write).toHaveBeenCalledWith({ type: 'text-end', id: 'part-1' })
      expect(state.currentTextId).toBeUndefined()
    })

    it('emits data-subagent-progress block_stop for sub-agent', () => {
      const msg: SdkMessage = {
        type: 'stream_event',
        parent_tool_use_id: 'tu-parent',
        event: { type: 'content_block_stop' },
      }

      processSdkMessage(msg, writer as any, makeState())

      expect(writer.write).toHaveBeenCalledWith({
        type: 'data-subagent-progress',
        data: {
          parentToolUseId: 'tu-parent',
          event: 'block_stop',
        },
      })
    })
  })

  // ── Assistant Message ──

  describe('assistant message', () => {
    it('emits tool-input-available for main agent tool_use blocks', () => {
      const msg: SdkMessage = {
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', name: 'Bash', id: 'tc-1', input: { command: 'ls' } },
            { type: 'text', text: 'Running command...' },
          ],
        },
      }

      processSdkMessage(msg, writer as any, makeState())

      expect(writer.write).toHaveBeenCalledWith({
        type: 'tool-input-available',
        toolCallId: 'tc-1',
        toolName: 'Bash',
        input: { command: 'ls' },
      })
    })

    it('emits data-subagent-completed with text for sub-agent', () => {
      const msg: SdkMessage = {
        type: 'assistant',
        parent_tool_use_id: 'tu-parent',
        message: {
          content: [
            { type: 'text', text: 'Sub-agent response' },
          ],
        },
      }

      processSdkMessage(msg, writer as any, makeState())

      expect(writer.write).toHaveBeenCalledWith({
        type: 'data-subagent-completed',
        data: {
          parentToolUseId: 'tu-parent',
          text: 'Sub-agent response',
        },
      })
    })

    it('emits data-subagent-started for sub-agent Task tool invocations', () => {
      const msg: SdkMessage = {
        type: 'assistant',
        parent_tool_use_id: 'tu-parent',
        message: {
          content: [
            { type: 'tool_use', name: 'Task', id: 'tc-task', input: { description: 'Do X' } },
          ],
        },
      }

      processSdkMessage(msg, writer as any, makeState())

      expect(writer.write).toHaveBeenCalledWith({
        type: 'data-subagent-started',
        data: {
          parentToolUseId: 'tu-parent',
          toolUseId: 'tc-task',
          input: { description: 'Do X' },
        },
      })
    })
  })

  // ── Result Message ──

  describe('result message', () => {
    it('extracts usage from modelUsage and emits data-usage', () => {
      const msg: SdkMessage = {
        type: 'result',
        result: 'success',
        duration_ms: 5000,
        total_cost_usd: 0.05,
        num_turns: 3,
        modelUsage: {
          'claude-sonnet-4-20250514': { inputTokens: 1000, outputTokens: 500 },
          'claude-haiku-3-5-20241022': { inputTokens: 200, outputTokens: 100 },
        },
      }

      const state = processSdkMessage(msg, writer as any, makeState())

      expect(state.inputTokens).toBe(1200)
      expect(state.outputTokens).toBe(600)
      expect(state.duration).toBe(5000)
      expect(writer.write).toHaveBeenCalledWith({
        type: 'data-usage',
        data: {
          inputTokens: 1200,
          outputTokens: 600,
          durationMs: 5000,
          costUsd: 0.05,
          numTurns: 3,
        },
      })
    })

    it('falls back to top-level usage when modelUsage is absent', () => {
      const msg: SdkMessage = {
        type: 'result',
        result: 'success',
        duration_ms: 3000,
        usage: { input_tokens: 800, output_tokens: 400 },
      }

      const state = processSdkMessage(msg, writer as any, makeState())

      expect(state.inputTokens).toBe(800)
      expect(state.outputTokens).toBe(400)
    })

    it('emits error events when is_error with errors array', () => {
      const msg: SdkMessage = {
        type: 'result',
        is_error: true,
        errors: ['Something went wrong', 'Another error'],
        result: 'error',
      }

      processSdkMessage(msg, writer as any, makeState())

      expect(writer.write).toHaveBeenCalledWith({
        type: 'error',
        errorText: '[SDK] Something went wrong',
      })
      expect(writer.write).toHaveBeenCalledWith({
        type: 'error',
        errorText: '[SDK] Another error',
      })
    })
  })

  // ── Unknown Messages ──

  describe('unknown message types', () => {
    it('ignores user messages', () => {
      const msg: SdkMessage = { type: 'user' }
      const state = processSdkMessage(msg, writer as any, makeState())
      expect(writer.write).not.toHaveBeenCalled()
      expect(state).toEqual(makeState())
    })

    it('ignores tool_progress messages', () => {
      const msg: SdkMessage = { type: 'tool_progress' }
      processSdkMessage(msg, writer as any, makeState())
      expect(writer.write).not.toHaveBeenCalled()
    })
  })
})
