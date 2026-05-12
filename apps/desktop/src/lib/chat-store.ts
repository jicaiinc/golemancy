import {
  API_PATHS,
  type CreateRunResponse,
  type ListMessagesResponse,
  type ListThreadsResponse,
  type MessageDto,
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

const NEW_KEY = '__new__';

const emptyThread = (threadId: string | null): ChatThreadState => ({
  threadId,
  messages: [],
  assistantDraft: '',
  streamState: 'idle',
  error: null,
});

export type ChatStore = {
  readonly threads: ThreadSummary[];
  readonly chats: Record<string, ChatThreadState>;
  readonly activeThreadId: string | null;
  readonly selectThread: (id: string) => void;
  readonly newChat: () => void;
  readonly sendMessage: (prompt: string) => Promise<void>;
  readonly refreshThreads: () => Promise<void>;
};

// Owns chat state for the whole app. Lives at App scope so streaming continues
// when the user switches threads or returns to the home composer.
export function useChatStore(apiClient: ApiClient | null): ChatStore {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [chats, setChats] = useState<Record<string, ChatThreadState>>({});
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const hydratedRef = useRef<Set<string>>(new Set());

  const patchChat = useCallback((key: string, patch: Partial<ChatThreadState>) => {
    setChats((prev) => {
      const curr = prev[key] ?? emptyThread(key === NEW_KEY ? null : key);
      return { ...prev, [key]: { ...curr, ...patch } };
    });
  }, []);

  const refreshThreads = useCallback(async () => {
    if (!apiClient) return;
    try {
      const data = await apiClient.getJson<ListThreadsResponse>(API_PATHS.threads);
      setThreads(data.threads);
    } catch {
      // Swallow — sidebar tolerates an empty list.
    }
  }, [apiClient]);

  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads]);

  const selectThread = useCallback(
    (id: string) => {
      setActiveThreadId(id);
      if (!apiClient || hydratedRef.current.has(id)) return;
      hydratedRef.current.add(id);
      void (async () => {
        try {
          const list = await apiClient.getJson<ListMessagesResponse>(
            API_PATHS.threadMessages(id),
          );
          patchChat(id, { messages: list.messages, threadId: id });
        } catch (err) {
          patchChat(id, {
            threadId: id,
            streamState: 'error',
            error: { kind: 'stream_failed', detail: formatError(err) },
          });
        }
      })();
    },
    [apiClient, patchChat],
  );

  const newChat = useCallback(() => {
    setActiveThreadId(null);
  }, []);

  const sendMessage = useCallback(
    async (prompt: string) => {
      if (!apiClient || !prompt.trim()) return;
      const existingThreadId = activeThreadId;
      const targetKey = existingThreadId ?? NEW_KEY;

      const optimisticMsg: MessageDto = {
        id: `optimistic-${Date.now()}`,
        threadId: existingThreadId ?? '',
        runId: null,
        role: 'user',
        content: prompt,
        createdAt: new Date().toISOString(),
      };

      setChats((prev) => {
        const curr = prev[targetKey] ?? emptyThread(existingThreadId);
        return {
          ...prev,
          [targetKey]: {
            ...curr,
            messages: [...curr.messages, optimisticMsg],
            assistantDraft: '',
            streamState: 'awaiting_key',
            error: null,
          },
        };
      });

      // Pre-flight: ask the sidecar if the provider's secret is set. Avoids
      // spending a POST /runs round-trip on a run we already know will fail,
      // and surfaces the "missing_key" UX immediately. The sidecar never
      // ships the value back — just `{ present, masked }`.
      try {
        const status = await apiClient.getJson<SecretStatusResponse>(
          API_PATHS.secretStatus(SECRET_ACCOUNTS.openaiApiKey),
        );
        if (!status.present) {
          patchChat(targetKey, { streamState: 'error', error: { kind: 'missing_key' } });
          return;
        }
      } catch (err) {
        patchChat(targetKey, {
          streamState: 'error',
          error: { kind: 'create_failed', detail: formatError(err) },
        });
        return;
      }

      let runResponse: CreateRunResponse;
      try {
        runResponse = await apiClient.postJson<CreateRunResponse>(API_PATHS.runs, {
          threadId: existingThreadId ?? undefined,
          prompt,
        });
      } catch (err) {
        patchChat(targetKey, {
          streamState: 'error',
          error: { kind: 'create_failed', detail: formatError(err) },
        });
        return;
      }

      const finalKey = runResponse.threadId;
      // Promote __new__ slot to its real thread id once the server assigns one.
      if (targetKey !== finalKey) {
        setChats((prev) => {
          const transient = prev[targetKey];
          if (!transient) return prev;
          const { [targetKey]: _drop, ...rest } = prev;
          return { ...rest, [finalKey]: { ...transient, threadId: finalKey } };
        });
        hydratedRef.current.add(finalKey);
        // Only follow the new thread if the user was still on the composer.
        if (existingThreadId === null && activeThreadId === null) {
          setActiveThreadId(finalKey);
        }
      }

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
        if (engineError !== null) {
          patchChat(finalKey, {
            streamState: 'error',
            error: { kind: 'engine', detail: engineError },
            assistantDraft: '',
          });
          await refreshThreads();
          return;
        }
        try {
          const list = await apiClient.getJson<ListMessagesResponse>(
            API_PATHS.threadMessages(finalKey),
          );
          patchChat(finalKey, {
            messages: list.messages,
            assistantDraft: '',
            streamState: 'idle',
          });
        } catch {
          patchChat(finalKey, { assistantDraft: '', streamState: 'idle' });
        }
        await refreshThreads();
      } catch (err) {
        patchChat(finalKey, {
          streamState: 'error',
          error: { kind: 'stream_failed', detail: formatError(err) },
          assistantDraft: '',
        });
      }
    },
    [activeThreadId, apiClient, patchChat, refreshThreads],
  );

  return { threads, chats, activeThreadId, selectThread, newChat, sendMessage, refreshThreads };
}

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
