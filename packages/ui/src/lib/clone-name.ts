/**
 * Generate a clone name like "Foo (1)", "Foo (2)", etc.
 * Strips any existing trailing " (N)" to find the root name,
 * then picks the next available number.
 */
export function getCloneName(baseName: string, existingNames: string[]): string {
  const root = baseName.replace(/\s*\(\d+\)$/, '')

  const escaped = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^${escaped}\\s*\\((\\d+)\\)$`)

  let maxNum = 0
  for (const name of existingNames) {
    const match = name.match(pattern)
    if (match) {
      maxNum = Math.max(maxNum, parseInt(match[1], 10))
    }
  }

  return `${root} (${maxNum + 1})`
}
