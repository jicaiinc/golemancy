import { Server } from '/Users/cai/developer/github/SoloCraft.team/node_modules/.pnpm/@modelcontextprotocol+sdk@1.27.1_zod@3.25.76/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/index.js';
import { StdioServerTransport } from '/Users/cai/developer/github/SoloCraft.team/node_modules/.pnpm/@modelcontextprotocol+sdk@1.27.1_zod@3.25.76/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/stdio.js';
console.error('Echo MCP server starting...');
const server = new Server({ name: 'echo-server', version: '1.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler('tools/list', async () => ({ tools: [{ name: 'echo', description: 'Echoes back', inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } }] }));
console.error('Echo MCP server ready.');
const transport = new StdioServerTransport();
await server.connect(transport);
