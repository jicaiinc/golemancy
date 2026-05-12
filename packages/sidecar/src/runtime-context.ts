import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { createDb, type GolemancyDb, repositories } from '@golemancy/db';
import { AgentsSdkEngine } from '@golemancy/runtime';
import type { ProviderConfig, ProviderId } from '@golemancy/shared';
import type { RunBroadcaster } from './run-broadcaster.js';
import { SecretStore } from './secret-store.js';

export type RunSlot = {
  readonly broadcaster: RunBroadcaster;
  readonly controller: AbortController;
};

export type RuntimeContext = {
  readonly db: GolemancyDb;
  readonly repos: {
    readonly threads: repositories.ThreadsRepo;
    readonly runs: repositories.RunsRepo;
    readonly runEvents: repositories.RunEventsRepo;
    readonly messages: repositories.MessagesRepo;
    readonly providers: repositories.ProvidersRepo;
    readonly settings: repositories.SettingsRepo;
  };
  readonly engine: AgentsSdkEngine;
  readonly defaultProvider: ProviderConfig;
  readonly inFlight: Map<string, RunSlot>;
  readonly secretStore: SecretStore;
};

// M1 ships with a single hard-coded OpenAI provider. Multi-provider config
// (and DB-backed provider list) lands in M3 together with the Anthropic / AI
// SDK adapter path. secretRef points at the OS keychain account name that
// the sidecar reads JIT before each run.
const DEFAULT_PROVIDER: ProviderConfig = {
  id: 'openai-default' as ProviderId,
  name: 'OpenAI',
  engine: 'agents-sdk',
  transport: 'openai-style',
  model: 'gpt-4o-mini',
  toolMode: 'disabled',
  secretRef: 'openai.apiKey',
  capabilities: { streaming: true, nativeToolCalling: true },
};

export function createRuntimeContext(dbPath: string): RuntimeContext {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = createDb({ path: dbPath });
  return {
    db,
    repos: {
      threads: new repositories.ThreadsRepo(db),
      runs: new repositories.RunsRepo(db),
      runEvents: new repositories.RunEventsRepo(db),
      messages: new repositories.MessagesRepo(db),
      providers: new repositories.ProvidersRepo(db),
      settings: new repositories.SettingsRepo(db),
    },
    engine: new AgentsSdkEngine(),
    defaultProvider: DEFAULT_PROVIDER,
    inFlight: new Map(),
    secretStore: new SecretStore(),
  };
}
