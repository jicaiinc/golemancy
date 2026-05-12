import { serve } from "@hono/node-server";
import { createSidecarApp, createSidecarContext } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();
const context = createSidecarContext(config);
const app = createSidecarApp(context);

const server = serve({
  fetch: app.fetch,
  hostname: config.host,
  port: config.port,
});

console.info(`Golemancy sidecar listening on http://${config.host}:${config.port}`);

function shutdown(signal: NodeJS.Signals): void {
  console.info(`Golemancy sidecar received ${signal}; shutting down`);
  server.close(async () => {
    context.runManager.dispose();
    await context.runtimeEngines.dispose();
    context.database.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
