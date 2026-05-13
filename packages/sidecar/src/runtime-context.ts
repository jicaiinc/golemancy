import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { createDb, type GolemancyDb, repositories } from '@golemancy/db';
import { AgentsSdkEngine } from '@golemancy/runtime';
import type { ProviderConfig, ProviderId } from '@golemancy/shared';
import { BrowserBridge } from './browser-bridge.js';
import type { RunBroadcaster } from './run-broadcaster.js';
import { SecretStore } from './secret-store.js';

export type RunSlot = {
  readonly broadcaster: RunBroadcaster;
  readonly controller: AbortController;
  // Resolves once the executor's finally block has run (broadcaster closed,
  // inFlight entry removed). Cascade-delete handlers wait on this so they can
  // tear down threads/runs without racing the executor's last writes.
  readonly done: Promise<void>;
  readonly resolveDone: () => void;
};

export type RuntimeContext = {
  readonly db: GolemancyDb;
  readonly repos: {
    readonly projects: repositories.ProjectsRepo;
    readonly threads: repositories.ThreadsRepo;
    readonly runs: repositories.RunsRepo;
    readonly runEvents: repositories.RunEventsRepo;
    readonly messages: repositories.MessagesRepo;
    readonly providers: repositories.ProvidersRepo;
    readonly settings: repositories.SettingsRepo;
  };
  readonly engine: AgentsSdkEngine;
  readonly defaultProvider: ProviderConfig;
  readonly browserBridge: BrowserBridge;
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

// Aborts every in-flight run whose run row references one of `threadIds`, then
// waits (bounded) for the executors' finally blocks to flush. Callers use this
// before cascade-deleting threads or projects so the executor can't keep
// persisting events/messages against rows that are about to be deleted.
export async function drainRunsForThreads(
  ctx: RuntimeContext,
  threadIds: readonly string[],
  timeoutMs = 3000,
): Promise<void> {
  if (threadIds.length === 0) return;
  const drains: Promise<void>[] = [];
  for (const tid of threadIds) {
    const runs = await ctx.repos.runs.listByThread(tid);
    for (const r of runs) {
      const slot = ctx.inFlight.get(r.id);
      if (slot) {
        slot.controller.abort();
        drains.push(slot.done);
      }
    }
  }
  if (drains.length === 0) return;
  await Promise.race([
    Promise.all(drains).then(() => undefined),
    new Promise<void>((resolve) => {
      const t = setTimeout(resolve, timeoutMs);
      t.unref?.();
    }),
  ]);
}

export function createRuntimeContext(dbPath: string): RuntimeContext {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = createDb({ path: dbPath });
  return {
    db,
    repos: {
      projects: new repositories.ProjectsRepo(db),
      threads: new repositories.ThreadsRepo(db),
      runs: new repositories.RunsRepo(db),
      runEvents: new repositories.RunEventsRepo(db),
      messages: new repositories.MessagesRepo(db),
      providers: new repositories.ProvidersRepo(db),
      settings: new repositories.SettingsRepo(db),
    },
    engine: new AgentsSdkEngine(),
    defaultProvider: DEFAULT_PROVIDER,
    browserBridge: new BrowserBridge(),
    inFlight: new Map(),
    secretStore: new SecretStore(),
  };
}
