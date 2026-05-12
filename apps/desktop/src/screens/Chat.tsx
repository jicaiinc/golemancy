import type { MessageDto } from '@golemancy/protocol';
import { Composer, useT } from '@golemancy/ui';
import { useEffect, useRef } from 'react';
import type { ChatError, ChatThreadState } from '../lib/chat-store.js';

export type ChatPanelProps = {
  state: ChatThreadState;
  title: string | null;
  projectName: string | null;
  isDraft: boolean;
  onSubmit: (text: string) => void;
};

export function ChatPanel({ state, title, projectName, isDraft, onSubmit }: ChatPanelProps) {
  const t = useT();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const busy = state.streamState === 'streaming' || state.streamState === 'awaiting_key';

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [state.messages.length, state.assistantDraft, state.streamState]);

  const headerTitle = (() => {
    if (isDraft && projectName) {
      return t('chat.draftIn', 'New chat · {{project}}', { project: projectName });
    }
    if (title) return title;
    if (isDraft) return t('chat.draft', 'New chat');
    return t('chat.untitled', '(untitled)');
  })();

  return (
    <section className="chat-pane">
      <header className="chat-pane__header">
        <span className="chat-pane__title">{headerTitle}</span>
        {projectName && !isDraft ? (
          <span className="chat-pane__project">· {projectName}</span>
        ) : null}
      </header>

      <div className="chat-pane__scroll" ref={scrollRef}>
        <div className="chat-pane__inner">
          {state.messages.map((m) => (
            <Bubble key={m.id} role={m.role} content={m.content} />
          ))}
          {state.assistantDraft ? (
            <Bubble role="assistant" content={state.assistantDraft} pending />
          ) : null}
          {state.streamState === 'awaiting_key' ? (
            <Bubble
              role="system"
              content={t('chat.status.awaitingKey', 'Reading OpenAI key from keychain…')}
            />
          ) : null}
          {state.streamState === 'streaming' && !state.assistantDraft ? (
            <Bubble
              role="system"
              content={t('chat.status.streaming', 'Waiting for response…')}
            />
          ) : null}
          {state.streamState === 'error' && state.error ? (
            <Bubble role="system" content={`⚠ ${renderError(t, state.error)}`} error />
          ) : null}
        </div>
      </div>

      <div className="chat-pane__composer">
        <div className="chat-pane__composer-inner">
          <Composer
            onSubmit={onSubmit}
            disabled={busy}
            projectName={projectName ?? undefined}
            placeholder={
              busy
                ? t('chat.composer.busy', 'Streaming…')
                : t('chat.composer.placeholder', 'Send a message to Golemancy')
            }
          />
        </div>
      </div>
    </section>
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
  return (
    <div className={`bubble-row bubble-row--${role}`}>
      <div
        className={`bubble bubble--${role}`}
        data-pending={pending || undefined}
        data-error={error || undefined}
      >
        {content}
        {pending ? <span className="bubble__caret">▍</span> : null}
      </div>
    </div>
  );
}

function renderError(
  t: (key: string, fallback: string, vars?: Record<string, unknown>) => string,
  err: ChatError,
): string {
  switch (err.kind) {
    case 'missing_key':
      return t(
        'chat.errors.missingKey',
        'OpenAI API key is not set. Add it in Settings → Providers.',
      );
    case 'no_project':
      return t(
        'chat.errors.noProject',
        'No project selected. Create one in the sidebar first.',
      );
    case 'create_failed':
      return t('chat.errors.createFailed', 'Failed to start the run: {{detail}}', {
        detail: err.detail,
      });
    case 'stream_failed':
      return t('chat.errors.streamFailed', 'Stream interrupted: {{detail}}', {
        detail: err.detail,
      });
    case 'engine':
      return t('chat.errors.engine', 'Model returned an error: {{detail}}', {
        detail: err.detail,
      });
  }
}
