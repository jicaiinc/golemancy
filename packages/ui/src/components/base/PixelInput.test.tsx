import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { createRef } from 'react'
import { PixelInput } from './PixelInput'

describe('PixelInput', () => {
  it('renders an input element', () => {
    render(<PixelInput placeholder="Type here" />)
    expect(screen.getByPlaceholderText('Type here')).toBeInTheDocument()
  })

  it('renders label when provided', () => {
    render(<PixelInput label="Username" />)
    expect(screen.getByText('Username')).toBeInTheDocument()
  })

  it('does not render label when not provided', () => {
    const { container } = render(<PixelInput />)
    expect(container.querySelector('label')).toBeNull()
  })

  it('renders error message', () => {
    render(<PixelInput error="Required field" />)
    expect(screen.getByText('Required field')).toBeInTheDocument()
  })

  it('applies error styling to input', () => {
    render(<PixelInput error="Error" placeholder="err" />)
    expect(screen.getByPlaceholderText('err').className).toContain('border-accent-red')
  })

  it('renders helper text', () => {
    render(<PixelInput helper="Enter your name" />)
    expect(screen.getByText('Enter your name')).toBeInTheDocument()
  })

  it('hides helper text when error is present', () => {
    render(<PixelInput error="Error!" helper="Helper" />)
    expect(screen.getByText('Error!')).toBeInTheDocument()
    expect(screen.queryByText('Helper')).not.toBeInTheDocument()
  })

  it('renders disabled state', () => {
    render(<PixelInput disabled placeholder="disabled" />)
    expect(screen.getByPlaceholderText('disabled')).toBeDisabled()
  })

  it('forwards ref', () => {
    const ref = createRef<HTMLInputElement>()
    render(<PixelInput ref={ref} />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })

  it('accepts user input', async () => {
    const user = userEvent.setup()
    render(<PixelInput placeholder="type" />)
    const input = screen.getByPlaceholderText('type')
    await user.type(input, 'hello')
    expect(input).toHaveValue('hello')
  })
})
