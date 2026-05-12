import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type GolemancyDb } from './client.js';
import {
  MessagesRepo,
  ProjectsRepo,
  RunEventsRepo,
  RunsRepo,
  ThreadsRepo,
} from './repositories/index.js';

let dir: string;
let db: GolemancyDb;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'golemancy-db-test-'));
  db = createDb({ path: join(dir, 'test.sqlite') });
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('sqlite repositories', () => {
  it('persists the project to thread to run to event chain', async () => {
    const projects = new ProjectsRepo(db);
    const threads = new ThreadsRepo(db);
    const runs = new RunsRepo(db);
    const messages = new MessagesRepo(db);
    const events = new RunEventsRepo(db);

    const project = await projects.insert({ id: 'project_1', name: 'Launch' });
    const thread = await threads.insert({
      id: 'thread_1',
      projectId: project.id,
      title: 'First run',
    });
    const run = await runs.insert({
      id: 'run_1',
      threadId: thread.id,
      status: 'queued',
      providerId: 'openai-default',
      model: 'gpt-4o-mini',
      toolMode: 'disabled',
      createdAt: new Date().toISOString(),
    });
    await messages.insert({
      id: 'message_1',
      threadId: thread.id,
      runId: run.id,
      role: 'user',
      content: 'hello',
    });
    await events.insert({
      id: 'event_1',
      runId: run.id,
      sequence: 1,
      type: 'run_started',
      payload: '{"type":"run_started","runId":"run_1"}',
    });
    await runs.markCompleted(run.id, { inputTokens: 1, outputTokens: 2, totalTokens: 3 });

    expect(await projects.list()).toMatchObject([{ id: 'project_1', name: 'Launch' }]);
    expect(await threads.listByProject(project.id)).toMatchObject([{ id: 'thread_1' }]);
    expect(await messages.listByThread(thread.id)).toMatchObject([{ content: 'hello' }]);
    expect(await events.listByRun(run.id)).toMatchObject([{ sequence: 1, type: 'run_started' }]);
    expect(await runs.get(run.id)).toMatchObject({
      status: 'completed',
      inputTokens: 1,
      outputTokens: 2,
      totalTokens: 3,
    });
  });

  it('removes child threads when a project is deleted', async () => {
    const projects = new ProjectsRepo(db);
    const threads = new ThreadsRepo(db);

    await projects.insert({ id: 'project_1', name: 'Launch' });
    await threads.insert({ id: 'thread_1', projectId: 'project_1', title: 'First run' });
    await projects.remove('project_1');

    expect(await projects.get('project_1')).toBeUndefined();
    expect(await threads.get('thread_1')).toBeUndefined();
  });
});
