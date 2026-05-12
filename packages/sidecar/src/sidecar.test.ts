import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_PATHS } from '@golemancy/protocol';
import { BrowserBridge } from './browser-bridge.js';
import { createRuntimeContext, type RuntimeContext } from './runtime-context.js';
import { createApp } from './server.js';

const token = 'test-token-0123456789abcdef';
let dir: string;
let runtime: RuntimeContext;
let app: ReturnType<typeof createApp>;

const auth = () => ({ Authorization: `Bearer ${token}` });

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'golemancy-sidecar-test-'));
  runtime = createRuntimeContext(join(dir, 'golemancy.sqlite'));
  app = createApp({
    version: '0.2.0-test',
    token,
    startedAt: new Date('2026-05-12T00:00:00.000Z'),
    runtime,
  });
});

afterEach(async () => {
  runtime.db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('sidecar app integration', () => {
  it('serves health without auth but protects product routes', async () => {
    const health = await app.request(API_PATHS.health);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({ status: 'ok', version: '0.2.0-test' });

    const projects = await app.request(API_PATHS.projects);
    expect(projects.status).toBe(401);
  });

  it('creates, lists, renames, and deletes projects through the authenticated HTTP surface', async () => {
    const created = await app.request(API_PATHS.projects, {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Launch plan' }),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { project: { id: string; name: string } };
    expect(createdBody.project.name).toBe('Launch plan');

    const listed = await app.request(API_PATHS.projects, { headers: auth() });
    await expect(listed.json()).resolves.toMatchObject({
      projects: [{ id: createdBody.project.id, name: 'Launch plan' }],
    });

    const renamed = await app.request(API_PATHS.project(createdBody.project.id), {
      method: 'PATCH',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated plan' }),
    });
    expect(renamed.status).toBe(200);
    await expect(renamed.json()).resolves.toMatchObject({ project: { name: 'Updated plan' } });

    const deleted = await app.request(API_PATHS.project(createdBody.project.id), {
      method: 'DELETE',
      headers: auth(),
    });
    expect(deleted.status).toBe(200);
    await expect(deleted.json()).resolves.toEqual({ ok: true });
  });

  it('rejects invalid project payloads through protocol validation', async () => {
    const response = await app.request(API_PATHS.projects, {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_request' });
  });
});

describe('browser bridge', () => {
  it('routes a browser action through the native polling channel and resolves its response', async () => {
    const bridge = new BrowserBridge();
    const poll = bridge.poll(
      'profile_1',
      {
        sessionId: 'session_1',
        extensionId: 'extension_1',
        extensionVersion: '0.2.0',
        browser: 'chrome',
      },
      1_000,
    );

    const action = bridge.invoke({ method: 'page.extract', params: { selector: 'main' } });
    const command = await poll;

    expect(command).toMatchObject({
      method: 'page.extract',
      params: { selector: 'main' },
    });

    bridge.handleNativeMessage({ id: command!.id, result: { text: 'content' } });
    await expect(action).resolves.toEqual({ text: 'content' });
    expect(bridge.getStatus()).toMatchObject({ onlineProfiles: 1, pendingActions: 0 });
  });
});
