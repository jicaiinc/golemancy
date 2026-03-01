import { describe, it, expect, vi } from 'vitest'
import type { UIMessage, CompactRecord } from '@golemancy/shared'
import { buildMessagesForModel } from './compact'

// compactConversation uses streamText from 'ai' — tested via mock
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return {
    ...actual,
    streamText: vi.fn(),
  }
})

describe('compactConversation', () => {
  it('streams text and returns summary with token usage', async () => {
    const { streamText } = await import('ai')

    const chunks = ['Hello', ' world', ' summary']
    const mockStream = (async function* () {
      for (const c of chunks) yield c
    })()

    vi.mocked(streamText).mockReturnValue({
      textStream: mockStream,
      totalUsage: Promise.resolve({ inputTokens: 100, outputTokens: 50 }),
      finishReason: Promise.resolve('stop'),
    } as any)

    const { compactConversation } = await import('./compact')

    const result = await compactConversation({
      messages: [{ role: 'user', content: 'test' }] as any,
      model: {} as any,
      systemPrompt: 'system',
    })

    expect(result.summary).toBe('Hello world summary')
    expect(result.inputTokens).toBe(100)
    expect(result.outputTokens).toBe(50)
  })

  it('calls onProgress with growing char count', async () => {
    const { streamText } = await import('ai')

    const chunks = ['ab', 'cd']
    const mockStream = (async function* () {
      for (const c of chunks) yield c
    })()

    vi.mocked(streamText).mockReturnValue({
      textStream: mockStream,
      totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      finishReason: Promise.resolve('stop'),
    } as any)

    const { compactConversation } = await import('./compact')
    const onProgress = vi.fn()

    await compactConversation({
      messages: [{ role: 'user', content: 'x' }] as any,
      model: {} as any,
      systemPrompt: 'sys',
      onProgress,
    })

    expect(onProgress).toHaveBeenCalledWith({ generatedChars: 2 })
    expect(onProgress).toHaveBeenCalledWith({ generatedChars: 4 })
  })

  it('throws when model returns empty response', async () => {
    const { streamText } = await import('ai')

    const mockStream = (async function* () {
      yield '   '
    })()

    vi.mocked(streamText).mockReturnValue({
      textStream: mockStream,
      totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 1 }),
      finishReason: Promise.resolve('stop'),
    } as any)

    const { compactConversation } = await import('./compact')

    await expect(compactConversation({
      messages: [{ role: 'user', content: 'x' }] as any,
      model: {} as any,
      systemPrompt: 'sys',
    })).rejects.toThrow('Compact failed: model returned empty response')
  })
})

describe('buildMessagesForModel', () => {
  const makeMsg = (id: string, role: 'user' | 'assistant', text: string): UIMessage => ({
    id,
    role,
    parts: [{ type: 'text', text }],
  })

  it('returns all messages when no compact record', () => {
    const msgs = [makeMsg('1', 'user', 'hi'), makeMsg('2', 'assistant', 'hello')]
    const result = buildMessagesForModel(msgs, null)
    expect(result).toBe(msgs)
  })

  it('returns all messages when boundary message not found', () => {
    const msgs = [makeMsg('1', 'user', 'hi'), makeMsg('2', 'assistant', 'hello')]
    const compact: CompactRecord = {
      id: 'compact-1',
      conversationId: 'conv-1' as any,
      summary: 'summary text',
      boundaryMessageId: 'nonexistent' as any,
      inputTokens: 100,
      outputTokens: 50,
      trigger: 'auto',
      createdAt: '2026-01-01T00:00:00Z',
    }
    const result = buildMessagesForModel(msgs, compact)
    expect(result).toBe(msgs)
  })

  it('prepends summary and returns messages after boundary', () => {
    const msgs = [
      makeMsg('1', 'user', 'old msg'),
      makeMsg('2', 'assistant', 'old reply'),
      makeMsg('3', 'user', 'boundary msg'),
      makeMsg('4', 'user', 'new msg'),
      makeMsg('5', 'assistant', 'new reply'),
    ]
    const compact: CompactRecord = {
      id: 'compact-1',
      conversationId: 'conv-1' as any,
      summary: 'Prior context summary',
      boundaryMessageId: '3' as any,
      inputTokens: 100,
      outputTokens: 50,
      trigger: 'auto',
      createdAt: '2026-01-01T00:00:00Z',
    }

    const result = buildMessagesForModel(msgs, compact)
    expect(result).toHaveLength(3) // summary + 2 recent messages
    expect(result[0].id).toBe('compact-summary')
    expect(result[0].role).toBe('user')
    expect((result[0].parts[0] as any).text).toContain('Prior context summary')
    expect(result[1].id).toBe('4')
    expect(result[2].id).toBe('5')
  })

  it('returns only summary when boundary is last message', () => {
    const msgs = [makeMsg('1', 'user', 'only')]
    const compact: CompactRecord = {
      id: 'compact-1',
      conversationId: 'conv-1' as any,
      summary: 'Sum',
      boundaryMessageId: '1' as any,
      inputTokens: 10,
      outputTokens: 5,
      trigger: 'manual',
      createdAt: '2026-01-01T00:00:00Z',
    }

    const result = buildMessagesForModel(msgs, compact)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('compact-summary')
  })
})
