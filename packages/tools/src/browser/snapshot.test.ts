import { describe, it, expect } from 'vitest'
import { formatSnapshotText, buildPageSnapshot } from './snapshot'
import type { SnapshotElement } from './driver'

describe('formatSnapshotText', () => {
  it('should format a simple element', () => {
    const elements: SnapshotElement[] = [
      { role: 'button', name: 'Submit' },
    ]
    expect(formatSnapshotText(elements)).toBe('button "Submit"')
  })

  it('should format element with ref', () => {
    const elements: SnapshotElement[] = [
      { role: 'button', name: 'Submit', ref: 'e0' },
    ]
    expect(formatSnapshotText(elements)).toBe('button "Submit" [ref=e0]')
  })

  it('should format element with multiple annotations', () => {
    const elements: SnapshotElement[] = [
      { role: 'checkbox', name: 'Agree', ref: 'e1', checked: true, disabled: true },
    ]
    expect(formatSnapshotText(elements)).toBe('checkbox "Agree" [ref=e1, disabled, checked]')
  })

  it('should format element with heading level', () => {
    const elements: SnapshotElement[] = [
      { role: 'heading', name: 'Title', level: 1 },
    ]
    expect(formatSnapshotText(elements)).toBe('heading "Title" [level=1]')
  })

  it('should format element with value', () => {
    const elements: SnapshotElement[] = [
      { role: 'textbox', name: 'Email', ref: 'e2', value: 'user@example.com' },
    ]
    expect(formatSnapshotText(elements)).toBe('textbox "Email" [ref=e2] value="user@example.com"')
  })

  it('should truncate long values at 100 chars', () => {
    const longValue = 'a'.repeat(150)
    const elements: SnapshotElement[] = [
      { role: 'textbox', name: 'Bio', value: longValue },
    ]
    const result = formatSnapshotText(elements)
    expect(result).toContain('a'.repeat(100) + '…')
    expect(result).not.toContain('a'.repeat(101))
  })

  it('should format nested children with indentation', () => {
    const elements: SnapshotElement[] = [
      {
        role: 'navigation',
        name: 'Main',
        children: [
          { role: 'link', name: 'Home', ref: 'e0' },
          { role: 'link', name: 'About', ref: 'e1' },
        ],
      },
    ]
    const result = formatSnapshotText(elements)
    expect(result).toBe(
      'navigation "Main":\n' +
      '  link "Home" [ref=e0]\n' +
      '  link "About" [ref=e1]',
    )
  })

  it('should handle deeply nested elements', () => {
    const elements: SnapshotElement[] = [
      {
        role: 'main',
        name: '',
        children: [
          {
            role: 'section',
            name: 'Content',
            children: [
              { role: 'paragraph', name: 'Hello' },
            ],
          },
        ],
      },
    ]
    const result = formatSnapshotText(elements)
    expect(result).toContain('    paragraph "Hello"')
  })

  it('should format element with name only', () => {
    const elements: SnapshotElement[] = [
      { role: '', name: 'Some text' },
    ]
    expect(formatSnapshotText(elements)).toBe('"Some text"')
  })

  it('should handle empty elements array', () => {
    expect(formatSnapshotText([])).toBe('')
  })

  it('should handle multiple top-level elements', () => {
    const elements: SnapshotElement[] = [
      { role: 'heading', name: 'Title', level: 1 },
      { role: 'paragraph', name: 'Body text' },
      { role: 'button', name: 'Action', ref: 'e0' },
    ]
    const result = formatSnapshotText(elements)
    const lines = result.split('\n')
    expect(lines).toHaveLength(3)
  })

  it('should respect initial indent parameter', () => {
    const elements: SnapshotElement[] = [
      { role: 'button', name: 'Test' },
    ]
    expect(formatSnapshotText(elements, 2)).toBe('    button "Test"')
  })
})

describe('buildPageSnapshot', () => {
  it('should build a complete page snapshot', () => {
    const elements: SnapshotElement[] = [
      { role: 'heading', name: 'Example', level: 1 },
      { role: 'link', name: 'More info', ref: 'e0' },
    ]
    const snap = buildPageSnapshot('https://example.com', 'Example Domain', elements)

    expect(snap.url).toBe('https://example.com')
    expect(snap.title).toBe('Example Domain')
    expect(snap.elements).toBe(elements)
    expect(snap.text).toContain('Page: Example Domain')
    expect(snap.text).toContain('URL: https://example.com')
    expect(snap.text).toContain('heading "Example" [level=1]')
    expect(snap.text).toContain('link "More info" [ref=e0]')
  })

  it('should have header followed by blank line', () => {
    const snap = buildPageSnapshot('https://test.com', 'Test', [])
    expect(snap.text).toBe('Page: Test\nURL: https://test.com\n\n')
  })
})
