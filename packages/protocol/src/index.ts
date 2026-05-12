import type { ISODateTime, ProviderTransport, RuntimeComponentStatus, RuntimeEnvironment, ToolMode } from "@golemancy/shared";

export type RunStatus =
  | "queued"
  | "running"
  | "waiting_for_approval"
  | "cancelling"
  | "completed"
  | "failed"
  | "cancelled";

export type RunEventType =
  | "run.created"
  | "run.started"
  | "text.delta"
  | "tool.call.requested"
  | "tool.call.approval_required"
  | "tool.call.approved"
  | "tool.call.rejected"
  | "tool.call.completed"
  | "tool.call.failed"
  | "usage.updated"
  | "run.completed"
  | "run.failed"
  | "run.cancelled";

export interface RunEvent<TPayload = unknown> {
  id: string;
  runId: string;
  sequence: number;
  type: RunEventType;
  payload: TPayload;
  providerData?: unknown;
  createdAt: ISODateTime;
}

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface RuntimeMessage {
  id?: string;
  role: MessageRole;
  content: string;
  createdAt?: ISODateTime;
}

export interface RuntimeProviderConfig {
  id: string;
  name: string;
  transport: ProviderTransport;
  model: string;
  toolMode: ToolMode;
  baseUrl?: string;
  apiKeySecretRef?: string;
  useResponses?: boolean;
  tracingDisabled?: boolean;
}

export interface RuntimeAgentConfig {
  name: string;
  instructions?: string;
}

export interface CreateRunRequest {
  threadId: string;
  messages: RuntimeMessage[];
  provider: RuntimeProviderConfig;
  agent?: RuntimeAgentConfig;
  engineId?: string;
}

export interface CreateRunResponse {
  runId: string;
  status: RunStatus;
}

export interface ProjectResource {
  id: string;
  name: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ThreadResource {
  id: string;
  projectId: string;
  title: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface MessageResource {
  id: string;
  threadId: string;
  runId?: string;
  role: MessageRole;
  content: string;
  providerData?: unknown;
  createdAt: ISODateTime;
}

export interface ListProjectsResponse {
  projects: ProjectResource[];
}

export interface CreateProjectResponse {
  project: ProjectResource;
}

export interface ListThreadsResponse {
  threads: ThreadResource[];
}

export interface CreateThreadResponse {
  thread: ThreadResource;
}

export interface ListMessagesResponse {
  messages: MessageResource[];
}

export interface ListRunEventsResponse {
  events: RunEvent[];
}

export interface LocalRuntimeConfig {
  apiBaseUrl: string;
  authToken: string;
  dataDir: string;
  nativeHostConfigPath?: string;
  sidecarPid: number;
  nodeVersion: string;
}

export interface DatabaseHealth {
  path: string;
  opened: boolean;
  migrationsApplied: number;
  schemaVersion: number;
}

export interface RuntimeStatusResponse {
  appVersion: string;
  environment: RuntimeEnvironment;
  nodeVersion: string;
  pid: number;
  uptimeSeconds: number;
  startedAt: ISODateTime;
  database: DatabaseHealth;
  components: RuntimeComponentStatus[];
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    detail?: unknown;
  };
}
