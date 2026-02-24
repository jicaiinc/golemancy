// ---------------------------------------------------------------------------
// Accessibility snapshot formatting — used by ExtensionDriver.
//
// PlaywrightDriver now uses agent-browser's built-in snapshot system
// (getEnhancedSnapshot, getSnapshotStats, diffSnapshots). This module
// remains for ExtensionDriver which receives raw SnapshotElement trees
// from the browser extension and needs to format them.
// ---------------------------------------------------------------------------

import type { SnapshotElement, PageSnapshot } from './driver'

// Re-export for use by drivers
export type { SnapshotElement } from './driver'

// ---------------------------------------------------------------------------
// Text formatting — converts tree to compact LLM-friendly text
// ---------------------------------------------------------------------------

/**
 * Format a snapshot element tree into indented text.
 *
 * Example output:
 * ```
 * navigation "Main":
 *   link "Home" [ref=e0]
 *   link "About" [ref=e1]
 * main:
 *   heading "Welcome" [level=1]
 *   textbox "Email" [ref=e2] value="user@example.com"
 *   button "Submit" [ref=e3]
 * ```
 */
export function formatSnapshotText(elements: SnapshotElement[], indent: number = 0): string {
  const lines: string[] = []
  const pad = '  '.repeat(indent)

  for (const el of elements) {
    let line = pad

    // Role + name
    if (el.role) {
      line += el.role
      if (el.name) line += ` "${el.name}"`
    } else if (el.name) {
      line += `"${el.name}"`
    }

    // Annotations
    const annotations: string[] = []
    if (el.ref) annotations.push(`ref=${el.ref}`)
    if (el.level != null) annotations.push(`level=${el.level}`)
    if (el.disabled) annotations.push('disabled')
    if (el.checked) annotations.push('checked')
    if (annotations.length) line += ` [${annotations.join(', ')}]`

    // Value (for form fields)
    if (el.value) {
      const displayValue = el.value.length > 100 ? el.value.slice(0, 100) + '…' : el.value
      line += ` value="${displayValue}"`
    }

    // Children
    if (el.children?.length) {
      line += ':'
      lines.push(line)
      lines.push(formatSnapshotText(el.children, indent + 1))
    } else {
      lines.push(line)
    }
  }

  return lines.join('\n')
}

/**
 * Build a complete PageSnapshot from raw tree data + page metadata.
 */
export function buildPageSnapshot(
  url: string,
  title: string,
  elements: SnapshotElement[],
): PageSnapshot {
  const header = `Page: ${title}\nURL: ${url}\n\n`
  const text = header + formatSnapshotText(elements)
  return { url, title, elements, text }
}
