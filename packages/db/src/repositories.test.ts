import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from ".";
import { MessageRepository, ProjectRepository, RunRepository, ThreadRepository } from "./repositories";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("RunRepository", () => {
  it("creates runs and appends ordered run events", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "golemancy-db-repo-"));
    tempDirs.push(dataDir);

    const database = openDatabase({ dataDir });
    database.client
      .prepare("INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run("project_1", "Project", "2026-05-12T00:00:00.000Z", "2026-05-12T00:00:00.000Z");
    database.client
      .prepare("INSERT INTO threads (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run("thread_1", "project_1", "Thread", "2026-05-12T00:00:00.000Z", "2026-05-12T00:00:00.000Z");

    const repository = new RunRepository(database);
    const run = repository.createRun({
      id: "run_1",
      threadId: "thread_1",
      status: "queued",
      providerId: "openai",
      modelId: "gpt-5.4",
      createdAt: "2026-05-12T00:00:01.000Z",
    });

    expect(run).toMatchObject({
      id: "run_1",
      threadId: "thread_1",
      status: "queued",
      providerId: "openai",
      modelId: "gpt-5.4",
    });

    repository.appendRunEvent({
      id: "event_1",
      runId: "run_1",
      type: "run.created",
      payload: { status: "queued" },
      createdAt: "2026-05-12T00:00:02.000Z",
    });
    repository.appendRunEvent({
      id: "event_2",
      runId: "run_1",
      type: "text.delta",
      payload: { delta: "hello" },
      providerData: { source: "test" },
      createdAt: "2026-05-12T00:00:03.000Z",
    });

    expect(repository.listRunEvents("run_1")).toEqual([
      {
        id: "event_1",
        runId: "run_1",
        sequence: 1,
        type: "run.created",
        payload: { status: "queued" },
        providerData: undefined,
        createdAt: "2026-05-12T00:00:02.000Z",
      },
      {
        id: "event_2",
        runId: "run_1",
        sequence: 2,
        type: "text.delta",
        payload: { delta: "hello" },
        providerData: { source: "test" },
        createdAt: "2026-05-12T00:00:03.000Z",
      },
    ]);

    database.close();
  });
});

describe("project, thread, and message repositories", () => {
  it("persists the conversation object graph and runtime messages", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "golemancy-conversation-repo-"));
    tempDirs.push(dataDir);

    const database = openDatabase({ dataDir });
    const projects = new ProjectRepository(database);
    const threads = new ThreadRepository(database);
    const messages = new MessageRepository(database);

    const project = projects.createProject({
      id: "project_1",
      name: "Golemancy",
      createdAt: "2026-05-12T00:00:00.000Z",
    });
    const thread = threads.createThread({
      id: "thread_1",
      projectId: project.id,
      title: "First run",
      createdAt: "2026-05-12T00:00:01.000Z",
    });
    messages.createMessage({
      id: "message_1",
      threadId: thread.id,
      role: "user",
      content: "hello",
      createdAt: "2026-05-12T00:00:02.000Z",
    });
    messages.createMessage({
      id: "message_2",
      threadId: thread.id,
      role: "assistant",
      content: "hi",
      providerData: { engineId: "fake" },
      createdAt: "2026-05-12T00:00:03.000Z",
    });

    expect(projects.listProjects()).toEqual([project]);
    expect(threads.listThreads(project.id)).toEqual([thread]);
    expect(messages.listRuntimeMessages(thread.id)).toEqual([
      {
        id: "message_1",
        role: "user",
        content: "hello",
        createdAt: "2026-05-12T00:00:02.000Z",
      },
      {
        id: "message_2",
        role: "assistant",
        content: "hi",
        createdAt: "2026-05-12T00:00:03.000Z",
      },
    ]);

    database.close();
  });
});
