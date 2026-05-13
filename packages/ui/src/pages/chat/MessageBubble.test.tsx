import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { UIMessage } from 'ai'
import { MessageBubble } from './MessageBubble'

// Mock motion/react
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => {
      const { initial, animate, exit, transition, variants, ...rest } = props
      return <div {...rest}>{children}</div>
    },
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

// Mock Streamdown — renders children as a div with data-testid for verification
vi.mock('streamdown', () => ({
  Streamdown: ({ children, mode, isAnimating }: { children: string; mode: string; isAnimating: boolean }) => (
    <div data-testid="streamdown" data-mode={mode} data-animating={String(isAnimating)}>
      {children}
    </div>
  ),
}))

function makeMessage(overrides?: Partial<UIMessage>): UIMessage {
  return {
    id: 'msg-1',
    role: 'user',
    parts: [{ type: 'text', text: 'Hello' }],
    ...overrides,
  } as UIMessage
}

describe('MessageBubble', () => {
  describe('user messages', () => {
    it('renders text in a plain <p> tag (no Streamdown)', () => {
      render(<MessageBubble message={makeMessage({ role: 'user', parts: [{ type: 'text', text: 'User says hi' }] })} />)

      expect(screen.getByText('User says hi')).toBeInTheDocument()
      expect(screen.queryByTestId('streamdown')).not.toBeInTheDocument()
    })

    it('never shows blinking cursor (even if streaming part exists)', () => {
      const parts = [{ type: 'text' as const, text: 'typing...', state: 'streaming' as const }]
      render(<MessageBubble message={makeMessage({ role: 'user', parts })} />)

      // User messages use <p>, no .streamdown-content container
      const p = screen.getByText('typing...')
      const cursor = p.parentElement!.querySelector('span.bg-accent-green')
      expect(cursor).not.toBeInTheDocument()
    })

    it('applies user bubble styling', () => {
      render(<MessageBubble message={makeMessage({ role: 'user', parts: [{ type: 'text', text: 'styled' }] })} />)

      const bubble = screen.getByTestId('chat-message')
      expect(bubble).toHaveAttribute('data-role', 'user')
      expect(bubble.className).toContain('justify-end')
    })
  })

  describe('assistant messages', () => {
    it('renders text via Streamdown component', () => {
      render(<MessageBubble message={makeMessage({ role: 'assistant', parts: [{ type: 'text', text: 'Hello from AI' }] })} />)

      const sd = screen.getByTestId('streamdown')
      expect(sd).toBeInTheDocument()
      expect(sd).toHaveTextContent('Hello from AI')
    })

    it('passes mode="static" when not streaming', () => {
      render(<MessageBubble message={makeMessage({ role: 'assistant', parts: [{ type: 'text', text: 'done' }] })} />)

      const sd = screen.getByTestId('streamdown')
      expect(sd).toHaveAttribute('data-mode', 'static')
      expect(sd).toHaveAttribute('data-animating', 'false')
    })

    it('passes mode="streaming" and isAnimating=true when streaming', () => {
      const parts = [{ type: 'text' as const, text: 'partial...', state: 'streaming' as const }]
      render(<MessageBubble message={makeMessage({ role: 'assistant', parts })} />)

      const sd = screen.getByTestId('streamdown')
      expect(sd).toHaveAttribute('data-mode', 'streaming')
      expect(sd).toHaveAttribute('data-animating', 'true')
    })

    it('shows blinking cursor during streaming', () => {
      const parts = [{ type: 'text' as const, text: 'typing...', state: 'streaming' as const }]
      render(<MessageBubble message={makeMessage({ role: 'assistant', parts })} />)

      // BlinkingCursor renders a span with bg-accent-green
      const container = screen.getByTestId('streamdown').parentElement!
      const cursor = container.querySelector('span.bg-accent-green')
      expect(cursor).toBeInTheDocument()
    })

    it('does not show blinking cursor when streaming is done', () => {
      render(<MessageBubble message={makeMessage({ role: 'assistant', parts: [{ type: 'text', text: 'complete' }] })} />)

      const container = screen.getByTestId('streamdown').parentElement!
      const cursor = container.querySelector('span.bg-accent-green')
      expect(cursor).not.toBeInTheDocument()
    })

    it('wraps content in .streamdown-content container', () => {
      render(<MessageBubble message={makeMessage({ role: 'assistant', parts: [{ type: 'text', text: 'test' }] })} />)

      const sd = screen.getByTestId('streamdown')
      expect(sd.parentElement!.className).toContain('streamdown-content')
    })

    it('applies assistant bubble styling', () => {
      render(<MessageBubble message={makeMessage({ role: 'assistant', parts: [{ type: 'text', text: 'hi' }] })} />)

      const bubble = screen.getByTestId('chat-message')
      expect(bubble).toHaveAttribute('data-role', 'assistant')
      expect(bubble.className).toContain('justify-start')
    })
  })

  describe('system messages', () => {
    it('renders centered text without Streamdown', () => {
      render(<MessageBubble message={makeMessage({ role: 'system', parts: [{ type: 'text', text: 'System notice' }] })} />)

      expect(screen.getByText('System notice')).toBeInTheDocument()
      expect(screen.queryByTestId('streamdown')).not.toBeInTheDocument()
      expect(screen.queryByTestId('chat-message')).not.toBeInTheDocument()
    })
  })
})
