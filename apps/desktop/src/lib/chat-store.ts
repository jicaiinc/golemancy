import {
  API_PATHS,
  type CreateRunResponse,
  type ListMessagesResponse,
  type ListProjectsResponse,
  type ListThreadsResponse,
  type MessageDto,
  type ProjectSummary,
  type SecretStatusResponse,
  type ThreadSummary,
} from '@golemancy/protocol';
import type { RunEvent } from '@golemancy/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiClient } from './api-client.js';
import { SECRET_ACCOUNTS } from './secret.js';
import { parseSseStream } from './sse.js';

export type StreamState = 'idle' | 'awaiting_key' | 'streaming' | 'error';

export type ChatError =
  | { kind: 'missing_key' }
  | { kind: 'no_project' }
  | { kind: 'create_failed'; detail: string }
  | { kind: 'stream_failed'; detail: string }
  | { kind: 'engine'; detail: string };

export type ChatThreadState = {
  threadId: string | null;
  messages: MessageDto[];
  assistantDraft: string;
  streamState: StreamState;
  error: ChatError | null;
};

export type ActiveRef =
  | { kind: 'draft'; projectId: string }
  | { kind: 'thread'; threadId: string }
  | null;

export type SessionStatus = 'idle' | 'processing' | 'unread';

export type DraftSummary = {
  projectId: string;
  createdAt: string;
};

const emptyState = (threadId: string | null): ChatThreadState => ({
  threadId,
  messages: [],
  assistantDraft: '',
  streamState: 'idle',
  error: null,
});

const draftKey = (projectId: string): string => `draft:${projectId}`;
const threadKey = (threadId: string): string => `thread:${threadId}`;

export type ChatStore = {
  readonly projects: ProjectSummary[];
  readonly threadsByProject: Record<string, ThreadSummary[]>;
  readonly unassignedThreads: ThreadSummary[];
  readonly drafts: Record<string, DraftSummary | undefined>;
  readonly chats: Record<string, ChatThreadState>;
  readonly sessionStatus: Record<string, SessionStatus>;
  readonly activeRef: ActiveRef;
  readonly activeProjectId: string | null;
  readonly refresh: () => Promise<void>;
  readonly createProject: (name?: string) => Promise<ProjectSummary | null>;
  readonly renameProject: (id: string, name: string) => Promise<void>;
  readonly deleteProject: (id: string) => Promise<void>;
  readonly newDraftInProject: (projectId: string) => void;
  readonly selectThread: (threadId: string) => void;
  readonly selectDraft: (projectId: string) => void;
  readonly clearActive: () => void;
  readonly renameThread: (id: string, title: string) => Promise<void>;
  readonly deleteThread: (id: string) => Promise<void>;
  readonly sendMessage: (prompt: string) => Promise<void>;
};

// Threads created by older clients (or any DB upgrade path) can have a null
// projectId. We keep them in a separate bucket so the sidebar can still surface
// them — silently dropping these would make pre-existing chats unreachable.
function groupByProject(threads: ThreadSummary[]): {
  byProject: Record<string, ThreadSummary[]>;
  unassigned: ThreadSummary[];
} {
  const byProject: Record<string, ThreadSummary[]> = {};
  const unassigned: ThreadSummary[] = [];
  for (const t of threads) {
    if (!t.projectId) {
      unassigned.push(t);
      continue;
    }
    (byProject[t.projectId] ??= []).push(t);
  }
  return { byProject, unassigned };
}

export function useChatStore(apiClient: ApiClient | null): ChatStore {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [threadsByProject, setThreadsByProject] = useState<Record<string, ThreadSummary[]>>({});
  const [unassignedThreads, setUnassignedThreads] = useState<ThreadSummary[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftSummary | undefined>>({});
  const [chats, setChats] = useState<Record<string, ChatThreadState>>({});
  const [sessionStatus, setSessionStatus] = useState<Record<string, SessionStatus>>({});
  const [activeRef, setActiveRef] = useState<ActiveRef>(null);
  const hydratedRef = useRef<Set<string>>(new Set());
  const activeRefLatest = useRef<ActiveRef>(null);
  activeRefLatest.current = activeRef;

  const patchChat = useCallback((key: string, patch: Partial<ChatThreadState>) => {
    setChats((prev) => {
      const curr = prev[key] ?? emptyState(null);
      return { ...prev, [key]: { ...curr, ...patch } };
    });
  }, []);

  const setStatus = useCallback((threadId: string, status: SessionStatus) => {
    setSessionStatus((prev) => {
      if (status === 'idle') {
        if (!(threadId in prev)) return prev;
        const { [threadId]: _drop, ...rest } = prev;
        return rest;
      }
      if (prev[threadId] === status) return prev;
      return { ...prev, [threadId]: status };
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!apiClient) return;
    try {
      const [projectsResp, threadsResp] = await Promise.all([
        apiClient.getJson<ListProjectsResponse>(API_PATHS.projects),
        apiClient.getJson<ListThreadsResponse>(API_PATHS.threads),
      ]);
      setProjects(projectsResp.projects);
      const grouped = groupByProject(threadsResp.threads);
      setThreadsByProject(grouped.byProject);
      setUnassignedThreads(grouped.unassigned);
    } catch {
      // sidebar tolerates empty; supervisor will retry handshake separately.
    }
  }, [apiClient]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createProject = useCallback(
    async (name?: string): Promise<ProjectSummary | null> => {
      if (!apiClient) return null;
      const trimmed = (name ?? '').trim() || 'New project';
      try {
        const resp = await apiClient.postJson<{ project: ProjectSummary }>(API_PATHS.projects, {
          name: trimmed,
        });
        setProjects((prev) => [resp.project, ...prev]);
        return resp.project;
      } catch {
        return null;
      }
    },
    [apiClient],
  );

  const renameProject = useCallback(
    async (id: string, name: string) => {
      if (!apiClient) return;
      try {
        const resp = await apiClient.fetch(API_PATHS.project(id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!resp.ok) return;
        const data = (await resp.json()) as { project: ProjectSummary };
        setProjects((prev) => prev.map((p) => (p.id === id ? data.project : p)));
      } catch {
        // ignore
      }
    },
    [apiClient],
  );

  const deleteProject = useCallback(
    async (id: string) => {
      if (!apiClient) return;
      try {
        await apiClient.fetch(API_PATHS.project(id), { method: 'DELETE' });
        setProjects((prev) => prev.filter((p) => p.id !== id));
        setThreadsByProject((prev) => {
          const { [id]: _drop, ...rest } = prev;
          return rest;
        });
        setDrafts((prev) => {
          const { [id]: _drop, ...rest } = prev;
          return rest;
        });
        setActiveRef((curr) => {
          if (!curr) return curr;
          if (curr.kind === 'draft' && curr.projectId === id) return null;
          if (curr.kind === 'thread') {
            const owner = Object.entries(threadsByProject).find(([pid, list]) =>
              pid === id && list.some((t) => t.id === curr.threadId),
            );
            if (owner) return null;
          }
          return curr;
        });
      } catch {
        // ignore
      }
    },
    [apiClient, threadsByProject],
  );

  const newDraftInProject = useCallback((projectId: string) => {
    setDrafts((prev) => ({
      ...prev,
      [projectId]: prev[projectId] ?? { projectId, createdAt: new Date().toISOString() },
    }));
    setChats((prev) => {
      const key = draftKey(projectId);
      if (prev[key]) return prev;
      return { ...prev, [key]: emptyState(null) };
    });
    setActiveRef({ kind: 'draft', projectId });
  }, []);

  const selectDraft = useCallback(
    (projectId: string) => {
      if (!drafts[projectId]) {
        newDraftInProject(projectId);
        return;
      }
      setActiveRef({ kind: 'draft', projectId });
    },
    [drafts, newDraftInProject],
  );

  const hydrateThread = useCallback(
    async (threadId: string) => {
      if (!apiClient || hydratedRef.current.has(threadId)) return;
      hydratedRef.current.add(threadId);
      try {
        const list = await apiClient.getJson<ListMessagesResponse>(
          API_PATHS.threadMessages(threadId),
        );
        patchChat(threadKey(threadId), { threadId, messages: list.messages });
      } catch (err) {
        patchChat(threadKey(threadId), {
          threadId,
          streamState: 'error',
          error: { kind: 'stream_failed', detail: formatError(err) },
        });
      }
    },
    [apiClient, patchChat],
  );

  const selectThread = useCallback(
    (threadId: string) => {
      setActiveRef({ kind: 'thread', threadId });
      setStatus(threadId, 'idle');
      void hydrateThread(threadId);
    },
    [hydrateThread, setStatus],
  );

  const clearActive = useCallback(() => {
    setActiveRef(null);
  }, []);

  const renameThread = useCallback(
    async (id: string, title: string) => {
      if (!apiClient) return;
      try {
        const resp = await apiClient.fetch(API_PATHS.thread(id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        });
        if (!resp.ok) return;
        const data = (await resp.json()) as { thread: ThreadSummary };
        setThreadsByProject((prev) => {
          const out: Record<string, ThreadSummary[]> = {};
          for (const [pid, list] of Object.entries(prev)) {
            out[pid] = list.map((t) => (t.id === id ? data.thread : t));
          }
          return out;
        });
        setUnassignedThreads((prev) => prev.map((t) => (t.id === id ? data.thread : t)));
      } catch {
        // ignore
      }
    },
    [apiClient],
  );

  const deleteThread = useCallback(
    async (id: string) => {
      if (!apiClient) return;
      try {
        await apiClient.fetch(API_PATHS.thread(id), { method: 'DELETE' });
        setThreadsByProject((prev) => {
          const out: Record<string, ThreadSummary[]> = {};
          for (const [pid, list] of Object.entries(prev)) {
            out[pid] = list.filter((t) => t.id !== id);
          }
          return out;
        });
        setUnassignedThreads((prev) => prev.filter((t) => t.id !== id));
        setChats((prev) => {
          const key = threadKey(id);
          if (!(key in prev)) return prev;
          const { [key]: _drop, ...rest } = prev;
          return rest;
        });
        setStatus(id, 'idle');
        setActiveRef((curr) =>
          curr && curr.kind === 'thread' && curr.threadId === id ? null : curr,
        );
      } catch {
        // ignore
      }
    },
    [apiClient, setStatus],
  );

  const sendMessage = useCallback(
    async (prompt: string) => {
      if (!apiClient || !prompt.trim()) return;

      // If the composer fires with no active ref (Home blank state),
      // synthesize a draft against the most-recently-active project, or
      // create one. We must promote the new ref synchronously and use a
      // local `current` — setActiveRef alone wouldn't flush before the
      // next read of activeRefLatest.current.
      let current = activeRefLatest.current;
      if (!current) {
        let fallbackProjectId: string | null = projects[0]?.id ?? null;
        if (!fallbackProjectId) {
          const created = await createProject();
          if (!created) return;
          fallbackProjectId = created.id;
        }
        const pid = fallbackProjectId;
        setDrafts((prev) =>
          prev[pid]
            ? prev
            : { ...prev, [pid]: { projectId: pid, createdAt: new Date().toISOString() } },
        );
        setChats((prev) =>
          prev[draftKey(pid)] ? prev : { ...prev, [draftKey(pid)]: emptyState(null) },
        );
        const nextRef: ActiveRef = { kind: 'draft', projectId: pid };
        setActiveRef(nextRef);
        activeRefLatest.current = nextRef;
        current = nextRef;
      }

      let projectId: string;
      let existingThreadId: string | null = null;
      let workingKey: string;

      if (current.kind === 'thread') {
        existingThreadId = current.threadId;
        workingKey = threadKey(existingThreadId);
        const owner = Object.entries(threadsByProject).find(([_, list]) =>
          list.some((t) => t.id === existingThreadId),
        );
        if (!owner) {
          patchChat(workingKey, {
            streamState: 'error',
            error: { kind: 'create_failed', detail: 'thread has no project' },
          });
          return;
        }
        projectId = owner[0];
      } else {
        projectId = current.projectId;
        workingKey = draftKey(projectId);
      }

      const optimisticMsg: MessageDto = {
        id: `optimistic-${Date.now()}`,
        threadId: existingThreadId ?? '',
        runId: null,
        role: 'user',
        content: prompt,
        createdAt: new Date().toISOString(),
      };

      setChats((prev) => {
        const curr = prev[workingKey] ?? emptyState(existingThreadId);
        return {
          ...prev,
          [workingKey]: {
            ...curr,
            messages: [...curr.messages, optimisticMsg],
            assistantDraft: '',
            streamState: 'awaiting_key',
            error: null,
          },
        };
      });

      try {
        const status = await apiClient.getJson<SecretStatusResponse>(
          API_PATHS.secretStatus(SECRET_ACCOUNTS.openaiApiKey),
        );
        if (!status.present) {
          patchChat(workingKey, { streamState: 'error', error: { kind: 'missing_key' } });
          return;
        }
      } catch (err) {
        patchChat(workingKey, {
          streamState: 'error',
          error: { kind: 'create_failed', detail: formatError(err) },
        });
        return;
      }

      let runResponse: CreateRunResponse;
      try {
        runResponse = await apiClient.postJson<CreateRunResponse>(API_PATHS.runs, {
          threadId: existingThreadId ?? undefined,
          projectId,
          prompt,
        });
      } catch (err) {
        patchChat(workingKey, {
          streamState: 'error',
          error: { kind: 'create_failed', detail: formatError(err) },
        });
        return;
      }

      const finalThreadId = runResponse.threadId;
      const finalKey = threadKey(finalThreadId);

      if (workingKey !== finalKey) {
        setChats((prev) => {
          const transient = prev[workingKey];
          if (!transient) return prev;
          const { [workingKey]: _drop, ...rest } = prev;
          return { ...rest, [finalKey]: { ...transient, threadId: finalThreadId } };
        });
        hydratedRef.current.add(finalThreadId);
        if (current.kind === 'draft') {
          setDrafts((prev) => {
            const { [projectId]: _drop, ...rest } = prev;
            return rest;
          });
          const newThread: ThreadSummary = {
            id: finalThreadId,
            title: prompt.slice(0, 64),
            projectId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          setThreadsByProject((prev) => {
            const list = prev[projectId] ?? [];
            if (list.some((t) => t.id === finalThreadId)) return prev;
            return { ...prev, [projectId]: [newThread, ...list] };
          });
          if (
            activeRefLatest.current?.kind === 'draft' &&
            activeRefLatest.current.projectId === projectId
          ) {
            setActiveRef({ kind: 'thread', threadId: finalThreadId });
          }
        }
      }

      setStatus(finalThreadId, 'processing');
      patchChat(finalKey, { streamState: 'streaming', assistantDraft: '', error: null });

      try {
        const res = await apiClient.fetch(API_PATHS.runEvents(runResponse.runId), {
          headers: { Accept: 'text/event-stream' },
        });
        if (!res.ok || !res.body) {
          throw new Error(`SSE handshake failed: ${res.status}`);
        }
        let pending = '';
        let engineError: string | null = null;
        for await (const frame of parseSseStream(res.body)) {
          const parsed = parseRunEvent(frame.data);
          if (!parsed) continue;
          if (parsed.type === 'text_delta') {
            pending += parsed.delta;
            patchChat(finalKey, { assistantDraft: pending });
          } else if (parsed.type === 'error') {
            engineError = parsed.error;
            break;
          } else if (parsed.type === 'done') {
            break;
          }
        }
        const stillActive =
          activeRefLatest.current?.kind === 'thread' &&
          activeRefLatest.current.threadId === finalThreadId;

        if (engineError !== null) {
          patchChat(finalKey, {
            streamState: 'error',
            error: { kind: 'engine', detail: engineError },
            assistantDraft: '',
          });
          setStatus(finalThreadId, stillActive ? 'idle' : 'unread');
          void refresh();
          return;
        }

        try {
          const list = await apiClient.getJson<ListMessagesResponse>(
            API_PATHS.threadMessages(finalThreadId),
          );
          patchChat(finalKey, {
            messages: list.messages,
            assistantDraft: '',
            streamState: 'idle',
          });
        } catch {
          patchChat(finalKey, { assistantDraft: '', streamState: 'idle' });
        }
        setStatus(finalThreadId, stillActive ? 'idle' : 'unread');
        void refresh();
      } catch (err) {
        const stillActive =
          activeRefLatest.current?.kind === 'thread' &&
          activeRefLatest.current.threadId === finalThreadId;
        patchChat(finalKey, {
          streamState: 'error',
          error: { kind: 'stream_failed', detail: formatError(err) },
          assistantDraft: '',
        });
        setStatus(finalThreadId, stillActive ? 'idle' : 'unread');
      }
    },
    [apiClient, projects, createProject, threadsByProject, patchChat, refresh, setStatus],
  );

  // Derive activeProjectId from activeRef + thread→project lookup.
  const activeProjectId: string | null = (() => {
    if (!activeRef) return null;
    if (activeRef.kind === 'draft') return activeRef.projectId;
    for (const [pid, list] of Object.entries(threadsByProject)) {
      if (list.some((t) => t.id === activeRef.threadId)) return pid;
    }
    return null;
  })();

  return {
    projects,
    threadsByProject,
    unassignedThreads,
    drafts,
    chats,
    sessionStatus,
    activeRef,
    activeProjectId,
    refresh,
    createProject,
    renameProject,
    deleteProject,
    newDraftInProject,
    selectThread,
    selectDraft,
    clearActive,
    renameThread,
    deleteThread,
    sendMessage,
  };
}

export const chatKeyForActive = (ref: ActiveRef): string | null => {
  if (!ref) return null;
  return ref.kind === 'thread' ? threadKey(ref.threadId) : draftKey(ref.projectId);
};

function parseRunEvent(raw: string): RunEvent | null {
  try {
    return JSON.parse(raw) as RunEvent;
  } catch {
    return null;
  }
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
