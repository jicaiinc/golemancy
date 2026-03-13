import type { ProjectTemplate } from '../types/template'
import { writingAssistantTemplate } from './projects/writing-assistant'
import { deepResearchTemplate } from './projects/deep-research'

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  writingAssistantTemplate,
  deepResearchTemplate,
]

export function getProjectTemplate(id: string): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find(t => t.id === id)
}
