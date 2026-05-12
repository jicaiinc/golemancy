export type ToolExecutionKind = "shell" | "cli-agent" | "mcp" | "skill" | "browser";

export interface ToolRegistryEntry {
  id: string;
  kind: ToolExecutionKind;
  label: string;
  requiresApproval: boolean;
}
