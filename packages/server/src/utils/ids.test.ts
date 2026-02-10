import { describe, it, expect } from 'vitest'
import { generateId } from './ids'

describe('generateId', () => {
  it.each(['proj', 'agent', 'conv', 'msg', 'task', 'art', 'mem'] as const)(
    'generates %s-prefixed ID with correct format',
    (prefix) => {
      const id = generateId(prefix)
      expect(id).toMatch(new RegExp(`^${prefix}-[a-zA-Z0-9_-]{12}$`))
    },
  )

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId('proj')))
    expect(ids.size).toBe(100)
  })
})
