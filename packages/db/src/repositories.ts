import { randomUUID } from "node:crypto";
import type { MessageRole, RunEvent, RunEventType, RunStatus, RuntimeMessage } from "@golemancy/protocol";
import type { OpenedDatabase } from "./index";

export interface CreateProjectInput {
  id?: string;
  name: string;
  createdAt?: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateThreadInput {
  id?: string;
  projectId: string;
  title: string;
  createdAt?: string;
}

export interface ThreadRecord {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMessageInput {
  id?: string;
  threadId: string;
  runId?: string;
  role: MessageRole;
  content: string;
  providerData?: unknown;
  createdAt?: string;
}

export interface MessageRecord {
  id: string;
  threadId: string;
  runId?: string;
  role: MessageRole;
  content: string;
  providerData?: unknown;
  createdAt: string;
}

export interface CreateRunRecordInput {
  id?: string;
  threadId: string;
  status: RunStatus;
  providerId?: string;
  modelId?: string;
  createdAt?: string;
}

export interface RunRecord {
  id: string;
  threadId: string;
  status: RunStatus;
  providerId?: string;
  modelId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface AppendRunEventInput<TPayload = unknown> {
  id?: string;
  runId: string;
  type: RunEventType;
  payload: TPayload;
  providerData?: unknown;
  createdAt?: string;
}

export class ProjectRepository {
  constructor(private readonly database: OpenedDatabase) {}

  createProject(input: CreateProjectInput): ProjectRecord {
    const now = input.createdAt ?? new Date().toISOString();
    const id = input.id ?? randomUUID();
    const name = input.name.trim();
    if (!name) {
      throw new Error("Project name is required");
    }

    this.database.client
      .prepare("INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(id, name, now, now);

    return {
      id,
      name,
      createdAt: now,
      updatedAt: now,
    };
  }

  listProjects(): ProjectRecord[] {
    const rows = this.database.client
      .prepare(
        `
          SELECT id, name, created_at, updated_at
          FROM projects
          ORDER BY updated_at DESC, created_at DESC
        `,
      )
      .all() as Array<{ id: string; name: string; created_at: string; updated_at: string }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  getProject(id: string): ProjectRecord | undefined {
    const row = this.database.client
      .prepare("SELECT id, name, created_at, updated_at FROM projects WHERE id = ?")
      .get(id) as { id: string; name: string; created_at: string; updated_at: string } | undefined;

    return row
      ? {
          id: row.id,
          name: row.name,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }
      : undefined;
  }
}

export class ThreadRepository {
  constructor(private readonly database: OpenedDatabase) {}

  createThread(input: CreateThreadInput): ThreadRecord {
    const now = input.createdAt ?? new Date().toISOString();
    const id = input.id ?? randomUUID();
    const title = input.title.trim();
    if (!title) {
      throw new Error("Thread title is required");
    }

    this.database.client
      .prepare("INSERT INTO threads (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, input.projectId, title, now, now);

    return {
      id,
      projectId: input.projectId,
      title,
      createdAt: now,
      updatedAt: now,
    };
  }

  listThreads(projectId: string): ThreadRecord[] {
    const rows = this.database.client
      .prepare(
        `
          SELECT id, project_id, title, created_at, updated_at
          FROM threads
          WHERE project_id = ?
          ORDER BY updated_at DESC, created_at DESC
        `,
      )
      .all(projectId) as Array<{
      id: string;
      project_id: string;
      title: string;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map((row) => toThreadRecord(row));
  }

  getThread(id: string): ThreadRecord | undefined {
    const row = this.database.client
      .prepare("SELECT id, project_id, title, created_at, updated_at FROM threads WHERE id = ?")
      .get(id) as
      | {
          id: string;
          project_id: string;
          title: string;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    return row ? toThreadRecord(row) : undefined;
  }

  touchThread(id: string, updatedAt = new Date().toISOString()): void {
    this.database.client.prepare("UPDATE threads SET updated_at = ? WHERE id = ?").run(updatedAt, id);
  }
}

export class MessageRepository {
  constructor(private readonly database: OpenedDatabase) {}

  createMessage(input: CreateMessageInput): MessageRecord {
    const id = input.id ?? randomUUID();
    const createdAt = input.createdAt ?? new Date().toISOString();
    validateMessage(input);

    this.database.client
      .prepare(
        `
          INSERT INTO messages (id, thread_id, run_id, role, content, provider_data, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        id,
        input.threadId,
        input.runId ?? null,
        input.role,
        input.content,
        typeof input.providerData === "undefined" ? null : JSON.stringify(input.providerData),
        createdAt,
      );

    return {
      id,
      threadId: input.threadId,
      runId: input.runId,
      role: input.role,
      content: input.content,
      providerData: input.providerData,
      createdAt,
    };
  }

  listMessages(threadId: string): MessageRecord[] {
    const rows = this.database.client
      .prepare(
        `
          SELECT id, thread_id, run_id, role, content, provider_data, created_at
          FROM messages
          WHERE thread_id = ?
          ORDER BY created_at ASC, id ASC
        `,
      )
      .all(threadId) as Array<{
      id: string;
      thread_id: string;
      run_id: string | null;
      role: MessageRole;
      content: string;
      provider_data: string | null;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      threadId: row.thread_id,
      runId: row.run_id ?? undefined,
      role: row.role,
      content: row.content,
      providerData: row.provider_data ? JSON.parse(row.provider_data) : undefined,
      createdAt: row.created_at,
    }));
  }

  listRuntimeMessages(threadId: string): RuntimeMessage[] {
    return this.listMessages(threadId)
      .filter((message) => message.role === "system" || message.role === "user" || message.role === "assistant")
      .map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      }));
  }
}

export class RunRepository {
  constructor(private readonly database: OpenedDatabase) {}

  createRun(input: CreateRunRecordInput): RunRecord {
    const now = input.createdAt ?? new Date().toISOString();
    const id = input.id ?? randomUUID();

    this.database.client
      .prepare(
        `
          INSERT INTO runs (id, thread_id, status, provider_id, model_id, created_at, updated_at, completed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
        `,
      )
      .run(id, input.threadId, input.status, input.providerId ?? null, input.modelId ?? null, now, now);

    return {
      id,
      threadId: input.threadId,
      status: input.status,
      providerId: input.providerId,
      modelId: input.modelId,
      createdAt: now,
      updatedAt: now,
    };
  }

  updateRunStatus(id: string, status: RunStatus, completedAt?: string): void {
    const now = new Date().toISOString();
    this.database.client
      .prepare(
        `
          UPDATE runs
          SET status = ?, updated_at = ?, completed_at = ?
          WHERE id = ?
        `,
      )
      .run(status, now, completedAt ?? (isTerminalRunStatus(status) ? now : null), id);
  }

  appendRunEvent<TPayload = unknown>(input: AppendRunEventInput<TPayload>): RunEvent<TPayload> {
    const id = input.id ?? randomUUID();
    const createdAt = input.createdAt ?? new Date().toISOString();

    this.database.client.exec("BEGIN IMMEDIATE;");
    try {
      const row = this.database.client
        .prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM run_events WHERE run_id = ?")
        .get(input.runId) as { next_sequence: number };

      const sequence = row.next_sequence;
      this.database.client
        .prepare(
          `
            INSERT INTO run_events (id, run_id, sequence, type, payload, provider_data, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          id,
          input.runId,
          sequence,
          input.type,
          JSON.stringify(input.payload),
          typeof input.providerData === "undefined" ? null : JSON.stringify(input.providerData),
          createdAt,
        );
      this.database.client.exec("COMMIT;");

      return {
        id,
        runId: input.runId,
        sequence,
        type: input.type,
        payload: input.payload,
        providerData: input.providerData,
        createdAt,
      };
    } catch (error) {
      this.database.client.exec("ROLLBACK;");
      throw error;
    }
  }

  listRunEvents(runId: string): Array<RunEvent> {
    const rows = this.database.client
      .prepare(
        `
          SELECT id, run_id, sequence, type, payload, provider_data, created_at
          FROM run_events
          WHERE run_id = ?
          ORDER BY sequence ASC
        `,
      )
      .all(runId) as Array<{
      id: string;
      run_id: string;
      sequence: number;
      type: RunEventType;
      payload: string;
      provider_data: string | null;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      sequence: row.sequence,
      type: row.type,
      payload: JSON.parse(row.payload),
      providerData: row.provider_data ? JSON.parse(row.provider_data) : undefined,
      createdAt: row.created_at,
    }));
  }

  getRun(id: string): RunRecord | undefined {
    const row = this.database.client
      .prepare(
        `
          SELECT id, thread_id, status, provider_id, model_id, created_at, updated_at, completed_at
          FROM runs
          WHERE id = ?
        `,
      )
      .get(id) as
      | {
          id: string;
          thread_id: string;
          status: RunStatus;
          provider_id: string | null;
          model_id: string | null;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        }
      | undefined;

    return row
      ? {
          id: row.id,
          threadId: row.thread_id,
          status: row.status,
          providerId: row.provider_id ?? undefined,
          modelId: row.model_id ?? undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          completedAt: row.completed_at ?? undefined,
        }
      : undefined;
  }
}

function isTerminalRunStatus(status: RunStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function validateMessage(input: CreateMessageInput): void {
  if (!input.content.trim()) {
    throw new Error("Message content is required");
  }
  if (input.role !== "system" && input.role !== "user" && input.role !== "assistant" && input.role !== "tool") {
    throw new Error(`Unsupported message role: ${input.role}`);
  }
}

function toThreadRecord(row: {
  id: string;
  project_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}): ThreadRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
