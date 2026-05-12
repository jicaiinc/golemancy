import {
  API_PATHS,
  type CreateRunResponse,
  type ListMessagesResponse,
  type MessageDto,
} from '@golemancy/protocol';
import type { RunEvent } from '@golemancy/shared';
import { Composer, useT } from '@golemancy/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createApiClient, isReady, type ApiClient } from '../lib/api-client.js';
import { SECRET_KEYS, secretGet } from '../lib/secret.js';
import { useSidecarStatus, type SidecarStatus } from '../lib/sidecar.js';
import { parseSseStream } from '../lib/sse.js';

export type ChatIntent = { kind: 'new'; prompt: string } | { kind: 'resume'; threadId: string };

export type ChatScreenProps = {
  intent: ChatIntent;
  onBackHome: () => void;
};

type StreamState = 'idle' | 'awaiting_key' | 'streaming' | 'error';

export function ChatScreen({ intent, onBackHome }: ChatScreenProps) {
  const t = useT();
  const status = useSidecarStatus();
  const [threadId, setThreadId] = useState<string | null>(
    intent.kind === 'resume' ? intent.threadId : null,
  );
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [assistantDraft, setAssistantDraft] = useState<string>('');
  const [streamState, setStreamState] = useState<StreamState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const startedRef = useRef(false);

  const client = isReady(status) ? createApiClient({ url: status.url, token: status.token }) : null;

  const startRun = useCallback(
    async (apiClient: ApiClient, payload: { prompt: string; threadId: string | null }) => {
      // Optimistically show the user's message immediately so it sits above
      // the assistant draft as the model streams back. refreshMessages() later
      // replaces this with the canonical DB rows.
      const optimisticUserMsg: MessageDto = {
        id: `optimistic-${Date.now()}`,
        threadId: payload.threadId ?? '',
        runId: null,
        role: 'user',
        content: payload.prompt,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticUserMsg]);

      setStreamState('awaiting_key');
      setErrorMsg(null);
      const apiKey = await secretGet(SECRET_KEYS.openaiApiKey);
      if (!apiKey) {
        setStreamState('error');
        setErrorMsg(
          t('chat.errors.missingKey', 'OpenAI API key is not set. Add it in Settings → Providers.'),
        );
        return;
      }

      let runResponse: CreateRunResponse;
      try {
        runResponse = await apiClient.postJson<CreateRunResponse>(API_PATHS.runs, {
          threadId: payload.threadId ?? undefined,
          prompt: payload.prompt,
          apiKey,
        });
      } catch (err) {
        setStreamState('error');
        setErrorMsg(formatError(err));
        return;
      }

      setThreadId(runResponse.threadId);
      setStreamState('streaming');
      setAssistantDraft('');

      const controller = new AbortController();
      try {
        const res = await apiClient.fetch(API_PATHS.runEvents(runResponse.runId), {
          signal: controller.signal,
          headers: { Accept: 'text/event-stream' },
        });
        if (!res.ok || !res.body) {
          throw new Error(`SSE handshake failed: ${res.status}`);
        }
        let pending = '';
        for await (const frame of parseSseStream(res.body, controller.signal)) {
          const parsed = parseRunEvent(frame.data);
          if (!parsed) continue;
          if (parsed.type === 'text_delta') {
            pending += parsed.delta;
            setAssistantDraft(pending);
          } else if (parsed.type === 'error') {
            setStreamState('error');
            setErrorMsg(parsed.error);
            break;
          } else if (parsed.type === 'done') {
            break;
          }
        }
        // After the stream closes, refetch the canonical message list from DB.
        await refreshMessages(apiClient, runResponse.threadId);
        setAssistantDraft('');
        setStreamState((s) => (s === 'error' ? s : 'idle'));
      } catch (err) {
        setStreamState('error');
        setErrorMsg(formatError(err));
      }
    },
    [t],
  );

  const refreshMessages = useCallback(async (apiClient: ApiClient, tid: string) => {
    const list = await apiClient
      .getJson<ListMessagesResponse>(API_PATHS.threadMessages(tid))
      .catch(() => ({ messages: [] }));
    setMessages(list.messages);
  }, []);

  useEffect(() => {
    if (!client) return;
    if (startedRef.current) return;
    startedRef.current = true;

    if (intent.kind === 'new') {
      void startRun(client, { prompt: intent.prompt, threadId: null });
    } else {
      void refreshMessages(client, intent.threadId);
    }
  }, [client, intent, refreshMessages, startRun]);

  const onSubmit = useCallback(
    (text: string) => {
      if (!client) return;
      if (streamState === 'streaming' || streamState === 'awaiting_key') return;
      void startRun(client, { prompt: text, threadId });
    },
    [client, streamState, threadId, startRun],
  );

  return (
    <div className="chat" style={chatStyles.root}>
      <header style={chatStyles.header}>
        <button type="button" onClick={onBackHome} style={chatStyles.backBtn}>
          {t('chat.backHome', '← Home')}
        </button>
        <span style={chatStyles.title}>
          {t('chat.title', 'Chat')}
          {threadId ? ` · ${threadId.slice(0, 8)}` : ''}
        </span>
        <SidecarHint status={status} />
      </header>

      <div style={chatStyles.scroll}>
        {messages.map((m) => (
          <Bubble key={m.id} role={m.role} content={m.content} />
        ))}
        {assistantDraft ? <Bubble role="assistant" content={assistantDraft} pending /> : null}
        {streamState === 'awaiting_key' ? (
          <Bubble
            role="system"
            content={t('chat.status.awaitingKey', 'Reading OpenAI key from keychain…')}
          />
        ) : null}
        {streamState === 'streaming' && !assistantDraft ? (
          <Bubble role="system" content={t('chat.status.streaming', 'Waiting for response…')} />
        ) : null}
        {streamState === 'error' && errorMsg ? (
          <Bubble role="system" content={`⚠ ${errorMsg}`} error />
        ) : null}
      </div>

      <div style={chatStyles.composer}>
        <Composer
          onSubmit={onSubmit}
          placeholder={
            streamState === 'streaming'
              ? t('chat.composer.busy', 'Streaming…')
              : t('chat.composer.placeholder', 'Send a message to Golemancy')
          }
        />
      </div>
    </div>
  );
}

function Bubble({
  role,
  content,
  pending,
  error,
}: {
  role: MessageDto['role'];
  content: string;
  pending?: boolean;
  error?: boolean;
}) {
  const align = role === 'user' ? 'flex-end' : 'flex-start';
  const bg =
    role === 'user'
      ? 'var(--accent, #2563eb)'
      : role === 'assistant'
        ? 'var(--surface-2, rgba(255,255,255,0.06))'
        : 'transparent';
  const color = role === 'user' ? '#fff' : 'inherit';
  return (
    <div style={{ display: 'flex', justifyContent: align, marginBottom: 8 }}>
      <div
        style={{
          maxWidth: '72%',
          padding: '10px 14px',
          borderRadius: 12,
          background: bg,
          color,
          opacity: pending ? 0.85 : 1,
          border: error ? '1px solid #dc2626' : 'none',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.45,
          fontSize: 14,
        }}
      >
        {content}
        {pending ? <span style={{ opacity: 0.5 }}> ▍</span> : null}
      </div>
    </div>
  );
}

function SidecarHint({ status }: { status: SidecarStatus }) {
  if (status.status === 'ready') return null;
  return <span style={{ fontSize: 12, color: '#ca8a04' }}>sidecar: {status.status}</span>;
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

const chatStyles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    width: '100%',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 18px',
    borderBottom: '1px solid var(--border, rgba(255,255,255,0.08))',
  },
  title: {
    fontWeight: 600,
    fontSize: 13,
    flex: 1,
  },
  backBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    color: 'inherit',
  },
  scroll: {
    flex: 1,
    overflowY: 'auto',
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
  },
  composer: {
    padding: 18,
    borderTop: '1px solid var(--border, rgba(255,255,255,0.08))',
  },
};
