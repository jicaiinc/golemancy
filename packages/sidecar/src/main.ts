import { serve } from '@hono/node-server';
import { generateBearerToken } from './auth.js';
import { loadConfig } from './config.js';
import { clearNativeHostRuntime, writeNativeHostRuntime } from './runtime-handshake.js';
import { createRuntimeContext } from './runtime-context.js';
import { createApp } from './server.js';

async function main() {
  const config = loadConfig({
    host: process.env.GOLEMANCY_HOST,
    port: process.env.GOLEMANCY_PORT ? Number(process.env.GOLEMANCY_PORT) : undefined,
  });

  const token = generateBearerToken();
  const startedAt = new Date();
  const runtime = createRuntimeContext(config.dbPath);
  const app = createApp({ version: config.version, token, startedAt, runtime });

  const server = serve(
    { fetch: app.fetch, hostname: config.host, port: config.port },
    async (info) => {
      const url = `http://${info.address}:${info.port}`;
      await writeNativeHostRuntime({
        path: config.nativeHostRuntimePath,
        runtime: {
          url,
          token,
          pid: process.pid,
          version: config.version,
          writtenAt: startedAt.toISOString(),
        },
      });
      // Single, parseable line so the desktop shell can capture the URL/token on first stdout flush.
      process.stdout.write(`GOLEMANCY_SIDECAR_READY ${JSON.stringify({ url, token })}\n`);
    },
  );

  const shutdown = async () => {
    for (const slot of runtime.inFlight.values()) {
      slot.controller.abort();
    }
    await clearNativeHostRuntime(config.nativeHostRuntimePath);
    runtime.db.close();
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[sidecar] fatal:', err);
  process.exit(1);
});
