/**
 * Build sub-agent context instructions.
 *
 * Injected into sub-agent system prompt so the child agent knows:
 * - It's running as a delegated sub-agent
 * - Who delegated to it
 * - How to behave (absolute paths, concise reporting)
 */
export function buildSubAgentInstructions(parentAgentName: string): string {
  return `# Sub-agent Context

You are running as a sub-agent delegated by "${parentAgentName}".

- Always use absolute paths for files — the parent agent cannot resolve relative paths from your output.
- Be concise in your final response. Report what you did, what you found, or the result — not the full reasoning chain.
- If you encounter a blocker you cannot resolve, report it clearly so the parent agent can decide how to proceed.`
}
