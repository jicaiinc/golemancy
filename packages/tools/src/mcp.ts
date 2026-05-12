export type McpTransportKind = 'stdio' | 'http-sse';

export type McpClientHandle = {
  readonly serverId: string;
  readonly listTools: () => Promise<
    ReadonlyArray<{ name: string; description?: string; jsonSchema: unknown }>
  >;
  readonly callTool: (name: string, input: unknown) => Promise<unknown>;
  readonly stop: () => Promise<void>;
};

export interface McpClientFactory {
  connectStdio(spec: {
    id: string;
    command: string;
    args: ReadonlyArray<string>;
  }): Promise<McpClientHandle>;
  connectHttpSse(spec: { id: string; url: string }): Promise<McpClientHandle>;
}

export class NotYetImplementedMcpFactory implements McpClientFactory {
  async connectStdio(): Promise<McpClientHandle> {
    throw new Error('MCP stdio client is not implemented yet');
  }
  async connectHttpSse(): Promise<McpClientHandle> {
    throw new Error('MCP http-sse client is not implemented yet');
  }
}
