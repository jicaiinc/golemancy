import { randomUUID } from 'node:crypto';

export interface NativeError {
  readonly code: string;
  readonly message: string;
  readonly detail?: unknown;
}

export interface NativeRequest<TParams = unknown> {
  readonly id: string;
  readonly method: string;
  readonly params?: TParams;
  readonly timeoutMs?: number;
}

export interface NativeResponse<TResult = unknown> {
  readonly id: string;
  readonly result?: TResult;
  readonly error?: NativeError;
}

export type NativeFrame = NativeRequest | NativeResponse;

export interface BrowserProfile {
  readonly profileId: string;
  sessionId: string;
  extensionId: string;
  extensionVersion?: string;
  browser?: string;
  userAgent?: string;
  status: 'online' | 'stale';
  readonly connectedAt: string;
  lastSeenAt: string;
  metadata?: unknown;
}

export interface BrowserActionRequest {
  readonly profileId?: string;
  readonly method: string;
  readonly params?: unknown;
  readonly timeoutMs?: number;
}

interface PendingAction {
  readonly command: NativeRequest;
  readonly profileId: string;
  readonly createdAt: number;
  readonly timeout: NodeJS.Timeout;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: Error) => void;
}

interface PollWaiter {
  readonly profileId: string;
  readonly resolve: (message: NativeRequest | null) => void;
  readonly timeout: NodeJS.Timeout;
}

export interface BrowserPollSnapshot {
  readonly sessionId?: string;
  readonly extensionId?: string;
  readonly extensionVersion?: string;
  readonly browser?: string;
  readonly userAgent?: string;
  readonly connectedAt?: string;
  readonly metadata?: unknown;
}

const DEFAULT_ACTION_TIMEOUT_MS = 45_000;
const MAX_ACTION_TIMEOUT_MS = 180_000;
const DEFAULT_POLL_TIMEOUT_MS = 25_000;
const STALE_PROFILE_AFTER_MS = 45_000;

export class BrowserBridge {
  readonly #profiles = new Map<string, BrowserProfile>();
  readonly #queues = new Map<string, NativeRequest[]>();
  readonly #pending = new Map<string, PendingAction>();
  readonly #pollWaiters = new Map<string, PollWaiter[]>();

  listProfiles(): BrowserProfile[] {
    this.#markStaleProfiles();
    return [...this.#profiles.values()].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  }

  getStatus(): unknown {
    const profiles = this.listProfiles();
    return {
      profiles,
      onlineProfiles: profiles.filter((profile) => profile.status === 'online').length,
      pendingActions: this.#pending.size,
      queuedActions: [...this.#queues.values()].reduce((count, queue) => count + queue.length, 0),
    };
  }

  handleNativeMessage(message: unknown): { ok: true; messages: NativeFrame[] } {
    const frame = asNativeFrame(message);
    if (isResponseFrame(frame)) {
      this.#completePending(frame);
      return { ok: true, messages: [] };
    }

    this.#handleSessionEvent(frame);
    return { ok: true, messages: [] };
  }

  async invoke(request: BrowserActionRequest): Promise<unknown> {
    if (!request.method) {
      throw new Error('Browser action requires method');
    }

    const profile = this.#selectProfile(request.profileId);
    const id = `browser_${randomUUID()}`;
    const command: NativeRequest = {
      id,
      method: request.method,
      params: request.params,
      timeoutMs: clampTimeout(request.timeoutMs, DEFAULT_ACTION_TIMEOUT_MS, MAX_ACTION_TIMEOUT_MS),
    };

    const promise = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Browser action timed out after ${command.timeoutMs}ms: ${command.method}`));
      }, command.timeoutMs);

      this.#pending.set(id, {
        command,
        profileId: profile.profileId,
        createdAt: Date.now(),
        timeout,
        resolve,
        reject,
      });
    });

    this.#enqueue(profile.profileId, command);
    return promise;
  }

  async poll(
    profileId: string,
    snapshot: BrowserPollSnapshot = {},
    timeoutMs = DEFAULT_POLL_TIMEOUT_MS,
  ): Promise<NativeRequest | null> {
    const profile = this.#profiles.get(profileId);
    const now = new Date().toISOString();

    if (profile) {
      profile.status = 'online';
      profile.lastSeenAt = now;
      profile.sessionId = snapshot.sessionId ?? profile.sessionId;
      profile.extensionId = snapshot.extensionId ?? profile.extensionId;
      profile.extensionVersion = snapshot.extensionVersion ?? profile.extensionVersion;
      profile.browser = snapshot.browser ?? profile.browser;
      profile.userAgent = snapshot.userAgent ?? profile.userAgent;
      profile.metadata = snapshot.metadata ?? profile.metadata;
    } else {
      this.#profiles.set(profileId, {
        profileId,
        sessionId: snapshot.sessionId ?? 'unknown',
        extensionId: snapshot.extensionId ?? 'unknown',
        extensionVersion: snapshot.extensionVersion,
        browser: snapshot.browser,
        userAgent: snapshot.userAgent,
        status: 'online',
        connectedAt: snapshot.connectedAt ?? now,
        lastSeenAt: now,
        metadata: snapshot.metadata,
      });
    }

    const queued = this.#queues.get(profileId);
    const command = queued?.shift();
    if (command) {
      return command;
    }

    return new Promise((resolve) => {
      const waiter: PollWaiter = {
        profileId,
        resolve,
        timeout: setTimeout(() => {
          this.#removeWaiter(waiter);
          resolve(null);
        }, clampTimeout(timeoutMs, 1_000, 30_000)),
      };

      const waiters = this.#pollWaiters.get(profileId) ?? [];
      waiters.push(waiter);
      this.#pollWaiters.set(profileId, waiters);
    });
  }

  #handleSessionEvent(frame: NativeRequest): void {
    if (
      frame.method !== 'session.hello' &&
      frame.method !== 'session.profileInfo' &&
      frame.method !== 'session.heartbeat'
    ) {
      return;
    }

    const params = asRecord(frame.params);
    const profileId = readString(params.profileId) ?? readString(params.profileID);
    const sessionId = readString(params.sessionId);
    const extensionId = readString(params.extensionId);

    if (!profileId || !sessionId || !extensionId) {
      return;
    }

    const now = new Date().toISOString();
    const existing = this.#profiles.get(profileId);
    this.#profiles.set(profileId, {
      profileId,
      sessionId,
      extensionId,
      extensionVersion: readString(params.extensionVersion) ?? existing?.extensionVersion,
      browser: readString(params.browser) ?? existing?.browser,
      userAgent: readString(params.userAgent) ?? existing?.userAgent,
      status: 'online',
      connectedAt: existing?.connectedAt ?? readString(params.connectedAt) ?? now,
      lastSeenAt: now,
      metadata: frame.method === 'session.profileInfo' ? frame.params : existing?.metadata,
    });
  }

  #completePending(frame: NativeResponse): void {
    const pending = this.#pending.get(frame.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.#pending.delete(frame.id);

    if (frame.error) {
      pending.reject(toError(frame.error));
      return;
    }

    pending.resolve(frame.result);
  }

  #selectProfile(profileId?: string): BrowserProfile {
    this.#markStaleProfiles();

    if (profileId) {
      const profile = this.#profiles.get(profileId);
      if (!profile || profile.status !== 'online') {
        throw new Error(`Browser profile is not online: ${profileId}`);
      }
      return profile;
    }

    const selected = [...this.#profiles.values()]
      .filter((profile) => profile.status === 'online')
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))[0];

    if (!selected) {
      throw new Error('No Golemancy browser extension profile is online');
    }

    return selected;
  }

  #enqueue(profileId: string, command: NativeRequest): void {
    const waiters = this.#pollWaiters.get(profileId);
    const waiter = waiters?.shift();
    if (waiter) {
      clearTimeout(waiter.timeout);
      waiter.resolve(command);
      if (waiters && waiters.length > 0) {
        this.#pollWaiters.set(profileId, waiters);
      } else {
        this.#pollWaiters.delete(profileId);
      }
      return;
    }

    const queue = this.#queues.get(profileId) ?? [];
    queue.push(command);
    this.#queues.set(profileId, queue);
  }

  #removeWaiter(waiter: PollWaiter): void {
    const waiters = this.#pollWaiters.get(waiter.profileId);
    if (!waiters) {
      return;
    }

    const next = waiters.filter((item) => item !== waiter);
    if (next.length > 0) {
      this.#pollWaiters.set(waiter.profileId, next);
    } else {
      this.#pollWaiters.delete(waiter.profileId);
    }
  }

  #markStaleProfiles(): void {
    const now = Date.now();
    for (const profile of this.#profiles.values()) {
      const lastSeenAt = Date.parse(profile.lastSeenAt);
      if (Number.isFinite(lastSeenAt) && now - lastSeenAt > STALE_PROFILE_AFTER_MS) {
        profile.status = 'stale';
      }
    }
  }
}

export function asBrowserActionRequest(value: unknown): BrowserActionRequest {
  const record = asRecord(value);
  const method = readString(record.method);
  if (!method) {
    throw new Error('Browser action body requires method');
  }

  return {
    profileId: readString(record.profileId),
    method,
    params: 'params' in record ? record.params : undefined,
    timeoutMs: typeof record.timeoutMs === 'number' ? record.timeoutMs : undefined,
  };
}

function asNativeFrame(value: unknown): NativeFrame {
  const record = asRecord(value);
  const id = readString(record.id);
  if (!id) {
    throw new Error('Native message requires id');
  }

  if (typeof record.method === 'string') {
    return {
      id,
      method: record.method,
      params: record.params,
      timeoutMs: typeof record.timeoutMs === 'number' ? record.timeoutMs : undefined,
    };
  }

  return {
    id,
    result: record.result,
    error: isNativeError(record.error) ? record.error : undefined,
  };
}

function isResponseFrame(frame: NativeFrame): frame is NativeResponse {
  return !('method' in frame);
}

function isNativeError(value: unknown): value is NativeError {
  const record = asRecord(value);
  return typeof record.code === 'string' && typeof record.message === 'string';
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function clampTimeout(value: unknown, fallback: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(1_000, Math.trunc(value)));
}

function toError(error: NativeError): Error {
  const result = new Error(error.message);
  result.name = error.code;
  return result;
}
