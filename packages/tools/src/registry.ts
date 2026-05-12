export type ToolSource = 'builtin' | 'mcp' | 'skill' | 'browser' | 'cli-agent' | 'shell';

export type ToolDescriptor = {
  readonly name: string;
  readonly source: ToolSource;
  readonly description?: string;
  readonly jsonSchema: unknown;
  readonly requiresApproval?: boolean;
};

export type ToolHandlerContext = {
  readonly runId: string;
  readonly toolCallId: string;
  readonly signal: AbortSignal;
};

export type ToolHandler = (
  input: unknown,
  ctx: ToolHandlerContext,
) => Promise<{ ok: true; output: unknown } | { ok: false; error: string }>;

export class ToolRegistry {
  private readonly tools = new Map<string, { desc: ToolDescriptor; handler: ToolHandler }>();

  register(desc: ToolDescriptor, handler: ToolHandler): void {
    if (this.tools.has(desc.name)) {
      throw new Error(`tool "${desc.name}" is already registered`);
    }
    this.tools.set(desc.name, { desc, handler });
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  describe(name: string): ToolDescriptor | undefined {
    return this.tools.get(name)?.desc;
  }

  list(): ToolDescriptor[] {
    return Array.from(this.tools.values(), (t) => t.desc);
  }

  async invoke(name: string, input: unknown, ctx: ToolHandlerContext) {
    const entry = this.tools.get(name);
    if (!entry) {
      return { ok: false as const, error: `tool "${name}" is not registered` };
    }
    return entry.handler(input, ctx);
  }
}
