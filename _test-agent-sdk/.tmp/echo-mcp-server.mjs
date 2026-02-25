import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'echo-server', version: '1.0.0' });

server.tool('echo', 'Echoes back the input message with a prefix ECHO:', { message: z.string() }, async ({ message }) => {
  return { content: [{ type: 'text', text: 'ECHO: ' + message }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
