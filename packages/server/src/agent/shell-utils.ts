/**
 * Shell-escape a string. Simple strings pass through; others get single-quoted.
 */
export function shellEscape(s: string): string {
  if (/^[a-zA-Z0-9._\-/=:@]+$/.test(s)) return s
  return `'${s.replace(/'/g, "'\\''")}'`
}

/**
 * Build a shell-safe command string from command + args.
 * Escapes arguments that contain shell-special characters.
 */
export function buildShellCommand(command: string, args?: string[]): string {
  const parts = [shellEscape(command)]
  if (args) {
    parts.push(...args.map(shellEscape))
  }
  return parts.join(' ')
}
