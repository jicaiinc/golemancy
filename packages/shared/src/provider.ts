import type { ProviderId } from './ids.js';
import type { ToolMode } from './tool-mode.js';

// Top-level engine dimension. OpenAI Agents SDK is the primary RunLoop;
// CLI agents (Claude Code / Codex CLI) are independent runtimes that
// cannot be expressed as an Agents-SDK Model and bypass it entirely.
export type RuntimeEngineKind = 'agents-sdk' | 'cli-agent';

// Model-source path inside the Agents SDK engine. Only relevant when
// `engine === 'agents-sdk'`. `openai-style` covers the OpenAI Provider
// (Responses / Chat Completions / `baseURL`-compatible upstreams);
// `ai-sdk` routes through `@openai/agents-extensions` for Anthropic /
// Google / xAI / Groq and other Vercel AI SDK providers.
export type ProviderTransport = 'openai-style' | 'ai-sdk';

export type ProviderCapabilities = {
  readonly streaming: boolean;
  readonly nativeToolCalling: boolean;
  readonly jsonMode?: boolean;
  readonly vision?: boolean;
  readonly files?: boolean;
  readonly parallelToolCalls?: boolean;
  readonly maxContextTokens?: number;
};

export type ProviderConfig = {
  readonly id: ProviderId;
  readonly name: string;
  readonly engine: RuntimeEngineKind;
  readonly transport?: ProviderTransport;
  readonly baseUrl?: string;
  readonly model: string;
  readonly secretRef?: string;
  readonly toolMode: ToolMode;
  readonly capabilities: ProviderCapabilities;
  readonly providerOptions?: Record<string, unknown>;
};

export type CapabilityTestResult = {
  readonly providerId: ProviderId;
  readonly testedAt: string;
  readonly capabilities: ProviderCapabilities;
  readonly errors?: ReadonlyArray<string>;
};
