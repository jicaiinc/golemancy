import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { stdin, stdout } from "node:process";
import type { NativeFrame } from "./browser-bridge";

interface RuntimeConfig {
  apiBaseUrl: string;
  authToken: string;
}

interface SidecarResponse {
  ok?: boolean;
  messages?: NativeFrame[];
  message?: NativeFrame | null;
  error?: {
    code: string;
    message: string;
  };
}

const DEFAULT_CONFIG_PATH = join(homedir(), ".golemancy", "native-host-runtime.json");
const configPath = parseConfigPath(process.argv);

let buffer = Buffer.alloc(0);
let profileId: string | undefined;
let sessionId: string | undefined;
let extensionId: string | undefined;
let extensionVersion: string | undefined;
let browser: string | undefined;
let userAgent: string | undefined;
let connectedAt: string | undefined;
let profileMetadata: unknown;
let pollLoopStarted = false;
let stopped = false;

stdin.on("data", (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  void drainFrames();
});

stdin.on("end", () => {
  stopped = true;
  process.exit(0);
});

stdin.on("error", (error) => {
  stopped = true;
  console.error("Golemancy native host stdin error", error);
  process.exit(1);
});

async function drainFrames(): Promise<void> {
  while (buffer.length >= 4) {
    const length = buffer.readUInt32LE(0);
    if (buffer.length < length + 4) {
      return;
    }

    const payload = buffer.subarray(4, 4 + length);
    buffer = buffer.subarray(4 + length);

    try {
      const frame = JSON.parse(payload.toString("utf8")) as NativeFrame;
      updateSession(frame);
      const response = await postSidecar("/browser/native/messages", frame);
      for (const message of response.messages ?? []) {
        writeFrame(message);
      }
      startPollLoop();
    } catch (error) {
      console.error("Golemancy native host failed to process frame", error);
    }
  }
}

function startPollLoop(): void {
  if (pollLoopStarted || !profileId) {
    return;
  }

  pollLoopStarted = true;
  void pollLoop();
}

async function pollLoop(): Promise<void> {
  while (!stopped) {
    if (!profileId) {
      await delay(250);
      continue;
    }

    try {
      const response = await postSidecar("/browser/native/poll", {
        profileId,
        sessionId,
        extensionId,
        extensionVersion,
        browser,
        userAgent,
        connectedAt,
        metadata: profileMetadata,
        timeoutMs: 25_000,
      });

      if (response.message) {
        writeFrame(response.message);
      }
    } catch (error) {
      console.error("Golemancy native host poll failed", error);
      await delay(1_000);
    }
  }
}

async function postSidecar(path: string, body: unknown): Promise<SidecarResponse> {
  const config = readRuntimeConfig();
  const response = await fetch(new URL(path, config.apiBaseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.authToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as SidecarResponse;
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? `Sidecar request failed with HTTP ${response.status}`);
  }

  return payload;
}

function readRuntimeConfig(): RuntimeConfig {
  if (!existsSync(configPath)) {
    throw new Error(`Golemancy native host runtime config does not exist: ${configPath}`);
  }

  const value = JSON.parse(readFileSync(configPath, "utf8")) as Partial<RuntimeConfig>;
  if (!value.apiBaseUrl || !value.authToken) {
    throw new Error(`Golemancy native host runtime config is incomplete: ${configPath}`);
  }

  return {
    apiBaseUrl: value.apiBaseUrl,
    authToken: value.authToken,
  };
}

function writeFrame(message: NativeFrame): void {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  stdout.write(Buffer.concat([header, payload]));
}

function updateSession(frame: NativeFrame): void {
  if (!("method" in frame) || typeof frame.params !== "object" || frame.params === null) {
    return;
  }

  const params = frame.params as Record<string, unknown>;
  if (typeof params.profileId === "string") {
    profileId = params.profileId;
  }
  if (typeof params.sessionId === "string") {
    sessionId = params.sessionId;
  }
  if (typeof params.extensionId === "string") {
    extensionId = params.extensionId;
  }
  if (typeof params.extensionVersion === "string") {
    extensionVersion = params.extensionVersion;
  }
  if (typeof params.browser === "string") {
    browser = params.browser;
  }
  if (typeof params.userAgent === "string") {
    userAgent = params.userAgent;
  }
  if (typeof params.connectedAt === "string") {
    connectedAt = params.connectedAt;
  }
  if (frame.method === "session.profileInfo") {
    profileMetadata = frame.params;
  }
}

function parseConfigPath(argv: string[]): string {
  const index = argv.indexOf("--config");
  if (index >= 0 && argv[index + 1]) {
    return argv[index + 1]!;
  }

  return process.env.GOLEMANCY_NATIVE_HOST_CONFIG ?? DEFAULT_CONFIG_PATH;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
