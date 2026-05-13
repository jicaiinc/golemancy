import { describe, it, expect } from 'vitest'
import { getCloneName } from './clone-name'

describe('getCloneName', () => {
  it('returns "(1)" when no existing clones', () => {
    expect(getCloneName('Foo', ['Foo', 'Bar'])).toBe('Foo (1)')
  })

  it('increments to "(2)" when "(1)" exists', () => {
    expect(getCloneName('Foo', ['Foo', 'Foo (1)'])).toBe('Foo (2)')
  })

  it('finds the max number and increments', () => {
    expect(getCloneName('Foo', ['Foo', 'Foo (1)', 'Foo (3)'])).toBe('Foo (4)')
  })

  it('strips trailing "(N)" from source name before computing', () => {
    expect(getCloneName('Foo (2)', ['Foo', 'Foo (1)', 'Foo (2)'])).toBe('Foo (3)')
  })

  it('works with empty existing names', () => {
    expect(getCloneName('Foo', [])).toBe('Foo (1)')
  })

  it('handles names with special regex characters', () => {
    expect(getCloneName('My [Agent]', ['My [Agent]', 'My [Agent] (1)'])).toBe('My [Agent] (2)')
  })

  it('does not match partial name overlaps', () => {
    expect(getCloneName('Foo', ['Foobar (1)', 'Foo Bar (2)'])).toBe('Foo (1)')
  })
})
