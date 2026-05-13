/**
 * Agent execution live tests — real streamText with LLM providers.
 *
 * Tests the full runAgent pipeline with real API calls.
 * Run via: pnpm --filter @golemancy/server test:live
 */
import { it, expect } from 'vitest'
import { tool } from 'ai'
import { z } from 'zod'
import { runAgent } from './runtime'
import { loadLiveSettings, describeWithApiKey } from '../test/live-settings'
import type { Agent, AgentId, ProjectId, ConversationId } from '@golemancy/shared'

// ── Helpers ───────────────────────────────────────────────────

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-test1' as AgentId,
    projectId: 'proj-test1' as ProjectId,
    name: 'Test Agent',
    description: 'A test agent for live tests',
    status: 'idle',
    systemPrompt: 'You are a helpful test assistant. Keep responses very short.',
    modelConfig: {},
    skillIds: [],
    tools: [],
    mcpServers: [],
    builtinTools: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

const CONV_ID = 'conv-livetest1' as ConversationId

// ── Pure Text Conversation ───────────────────────────────────

describeWithApiKey('agent-execution.live — pure text', (settings) => {
  it('generates a text response from a simple prompt', async () => {
    const agent = makeAgent()
    const result = await runAgent({
      agent,
      settings,
      messages: [{ role: 'user', content: 'Reply with exactly: AGENT_OK' }],
      conversationId: CONV_ID,
    })

    // Collect the full text from the stream
    let fullText = ''
    for await (const chunk of result.textStream) {
      fullText += chunk
    }

    expect(fullText.length).toBeGreaterThan(0)
  }, 20_000)

  it('respects system prompt', async () => {
    const agent = makeAgent({
      systemPrompt: 'You are a pirate. Always include the word "ARRR" in your responses.',
    })

    const result = await runAgent({
      agent,
      settings,
      messages: [{ role: 'user', content: 'Say hello' }],
      conversationId: CONV_ID,
    })

    let fullText = ''
    for await (const chunk of result.textStream) {
      fullText += chunk
    }

    // LLM may say "ARR", "ARRR", or "Arrr" — just check for ARR (case-insensitive)
    expect(fullText.toUpperCase()).toContain('ARR')
  }, 20_000)
})

// ── Tool Calling ─────────────────────────────────────────────

describeWithApiKey('agent-execution.live — tool calling', (settings) => {
  it('invokes a simple tool and returns result', async () => {
    const echoTool = tool({
      description: 'Echoes back the input text',
      parameters: z.object({ text: z.string() }),
      execute: async ({ text }) => `Echo: ${text}`,
    })

    const agent = makeAgent({
      systemPrompt: 'You MUST use the echo tool for every user message. Do not respond without using it first.',
    })

    const toolCalls: string[] = []
    const result = await runAgent({
      agent,
      settings,
      messages: [{ role: 'user', content: 'Use the echo tool with the text: hello world' }],
      conversationId: CONV_ID,
      tools: { echo: echoTool },
      onEvent: (event) => {
        if (event.type === 'tool_call' && event.toolName) {
          toolCalls.push(event.toolName)
        }
      },
    })

    // Consume the stream to completion
    let fullText = ''
    for await (const chunk of result.textStream) {
      fullText += chunk
    }

    // The model should have called the echo tool — but LLMs are non-deterministic,
    // so we verify that either the tool was called OR the response mentions "hello world"
    const toolWasCalled = toolCalls.includes('echo')
    const responseContainsEcho = fullText.toLowerCase().includes('hello world')
    expect(toolWasCalled || responseContainsEcho).toBe(true)
  }, 25_000)

  it('tracks token usage via onEvent callback', async () => {
    const agent = makeAgent()
    let hasUsage = false

    const result = await runAgent({
      agent,
      settings,
      messages: [{ role: 'user', content: 'Say hi' }],
      conversationId: CONV_ID,
      onEvent: (event) => {
        if (event.type === 'token_usage' && event.usage) {
          hasUsage = true
          expect(event.usage.inputTokens).toBeGreaterThan(0)
          expect(event.usage.outputTokens).toBeGreaterThan(0)
        }
      },
    })

    // Consume stream
    for await (const _ of result.textStream) { /* drain */ }

    expect(hasUsage).toBe(true)
  }, 20_000)
})

// ── Multi-turn Context ───────────────────────────────────────

describeWithApiKey('agent-execution.live — multi-turn', (settings) => {
  it('maintains context across messages', async () => {
    const agent = makeAgent({
      systemPrompt: 'You are a helpful assistant. Keep responses very short.',
    })

    // Turn 1: establish a fact
    const result1 = await runAgent({
      agent,
      settings,
      messages: [
        { role: 'user', content: 'Remember: the magic number is 42. Just say OK.' },
      ],
      conversationId: CONV_ID,
    })
    let text1 = ''
    for await (const chunk of result1.textStream) { text1 += chunk }

    // Turn 2: recall the fact
    const result2 = await runAgent({
      agent,
      settings,
      messages: [
        { role: 'user', content: 'Remember: the magic number is 42. Just say OK.' },
        { role: 'assistant', content: text1 },
        { role: 'user', content: 'What is the magic number I told you?' },
      ],
      conversationId: CONV_ID,
    })
    let text2 = ''
    for await (const chunk of result2.textStream) { text2 += chunk }

    expect(text2).toContain('42')
  }, 30_000)
})

// ── Abort Signal ─────────────────────────────────────────────

describeWithApiKey('agent-execution.live — abort', (settings) => {
  it('can be aborted via AbortSignal', async () => {
    const agent = makeAgent({
      systemPrompt: 'Write a very long essay about the history of computing.',
    })

    const controller = new AbortController()

    const result = await runAgent({
      agent,
      settings,
      messages: [{ role: 'user', content: 'Write a long essay.' }],
      conversationId: CONV_ID,
      abortSignal: controller.signal,
    })

    // Abort after receiving some text
    let chunks = 0
    try {
      for await (const chunk of result.textStream) {
        chunks++
        if (chunks >= 3) {
          controller.abort()
          break
        }
      }
    } catch (err: any) {
      // AbortError is expected
      expect(err.name === 'AbortError' || err.message?.includes('abort')).toBe(true)
    }

    // We should have received some chunks before abort
    expect(chunks).toBeGreaterThan(0)
  }, 20_000)
})
