import { describe, it, expect } from 'vitest'
import { buildSubAgentInstructions } from './sub-agent-instructions'

describe('buildSubAgentInstructions', () => {
  it('includes parent agent name and key guidance', () => {
    const result = buildSubAgentInstructions('ProjectManager')
    expect(result).toContain('delegated by "ProjectManager"')
    expect(result).toContain('absolute paths')
    expect(result).toContain('concise')
  })
})
