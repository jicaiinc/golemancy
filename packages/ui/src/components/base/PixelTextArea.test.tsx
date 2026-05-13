import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { createRef } from 'react'
import { PixelTextArea } from './PixelTextArea'

describe('PixelTextArea', () => {
  it('renders a textarea element', () => {
    render(<PixelTextArea placeholder="Write something" />)
    expect(screen.getByPlaceholderText('Write something')).toBeInTheDocument()
  })

  it('renders label when provided', () => {
    render(<PixelTextArea label="Description" />)
    expect(screen.getByText('Description')).toBeInTheDocument()
  })

  it('does not render label when not provided', () => {
    const { container } = render(<PixelTextArea />)
    expect(container.querySelector('label')).toBeNull()
  })

  it('renders error message', () => {
    render(<PixelTextArea error="Too short" />)
    expect(screen.getByText('Too short')).toBeInTheDocument()
  })

  it('applies error styling', () => {
    render(<PixelTextArea error="Error" placeholder="err" />)
    expect(screen.getByPlaceholderText('err').className).toContain('border-accent-red')
  })

  it('renders disabled state', () => {
    render(<PixelTextArea disabled placeholder="disabled" />)
    expect(screen.getByPlaceholderText('disabled')).toBeDisabled()
  })

  it('forwards ref', () => {
    const ref = createRef<HTMLTextAreaElement>()
    render(<PixelTextArea ref={ref} />)
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement)
  })

  it('accepts user input', async () => {
    const user = userEvent.setup()
    render(<PixelTextArea placeholder="write" />)
    const textarea = screen.getByPlaceholderText('write')
    await user.type(textarea, 'hello world')
    expect(textarea).toHaveValue('hello world')
  })
})
