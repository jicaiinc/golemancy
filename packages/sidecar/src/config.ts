import { homedir } from "node:os";
import { join } from "node:path";
import type { RuntimeEnvironment } from "@golemancy/shared";

export interface SidecarConfig {
  appVersion: string;
  environment: RuntimeEnvironment;
  host: string;
  port: number;
  authToken: string;
  dataDir: string;
  openaiApiKey?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SidecarConfig {
  const port = Number.parseInt(env.GOLEMANCY_LOCAL_API_PORT ?? "47650", 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid GOLEMANCY_LOCAL_API_PORT: ${env.GOLEMANCY_LOCAL_API_PORT}`);
  }

  const authToken = env.GOLEMANCY_LOCAL_AUTH_TOKEN;
  if (!authToken || authToken.length < 24) {
    throw new Error("GOLEMANCY_LOCAL_AUTH_TOKEN must be provided and at least 24 characters long");
  }

  return {
    appVersion: env.npm_package_version ?? "0.2.0",
    environment: parseEnvironment(env.NODE_ENV),
    host: env.GOLEMANCY_LOCAL_API_HOST ?? "127.0.0.1",
    port,
    authToken,
    dataDir: env.GOLEMANCY_DATA_DIR ?? join(homedir(), ".golemancy", "dev"),
    openaiApiKey: env.GOLEMANCY_OPENAI_API_KEY,
  };
}

function parseEnvironment(value: string | undefined): RuntimeEnvironment {
  if (value === "production" || value === "test") {
    return value;
  }

  return "development";
}
