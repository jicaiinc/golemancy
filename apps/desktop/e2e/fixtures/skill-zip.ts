import AdmZip from 'adm-zip'

export interface SkillZipEntry {
  path: string
  content: string
}

export interface SkillZipDefinition {
  directory: string
  name: string
  description?: string
  instructions: string
  markdownFileName?: string
  extraFiles?: SkillZipEntry[]
}

export function buildSkillMarkdown(
  name: string,
  instructions: string,
  description = '',
): string {
  return [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    '---',
    instructions,
  ].join('\n')
}

export function buildSkillZip(definition: SkillZipDefinition): Buffer {
  const zip = new AdmZip()
  const markdownFileName = definition.markdownFileName ?? 'SKILL.md'
  zip.addFile(
    `${definition.directory}/${markdownFileName}`,
    Buffer.from(
      buildSkillMarkdown(definition.name, definition.instructions, definition.description ?? ''),
      'utf-8',
    ),
  )

  for (const entry of definition.extraFiles ?? []) {
    zip.addFile(`${definition.directory}/${entry.path}`, Buffer.from(entry.content, 'utf-8'))
  }

  return zip.toBuffer()
}
