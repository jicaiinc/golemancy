import { useCallback, useEffect, useState } from 'react';
import {
  AccountPopover,
  Home,
  I18nProvider,
  Sidebar,
  SettingsScreen,
  ThemeProvider,
  useT,
  type SettingsSectionId,
  type Translator,
} from '@golemancy/ui';
import type { HealthResponse, ListThreadsResponse, ThreadSummary } from '@golemancy/protocol';
import { useSidecarStatus, type SidecarStatus } from './lib/sidecar';
import { createApiClient, isReady, type ApiClient } from './lib/api-client';
import { ChatScreen, type ChatIntent } from './screens/Chat';
import { ProvidersSettingsSection } from './screens/ProvidersSettings';

type Screen =
  | { kind: 'home' }
  | { kind: 'chat'; intent: ChatIntent }
  | { kind: 'settings'; section: SettingsSectionId };

type HealthState = 'unknown' | 'probing' | 'ok' | 'fail';

function describeStatus(
  t: Translator,
  status: SidecarStatus,
  health: HealthState,
): { label: string; color: string } {
  switch (status.status) {
    case 'starting':
      return { label: t('sidecar.starting', 'sidecar: starting…'), color: '#ca8a04' };
    case 'ready':
      if (health === 'ok') {
        return {
          label: t('sidecar.ready', 'sidecar: OK · pid {{pid}}', { pid: status.pid }),
          color: '#16a34a',
        };
      }
      if (health === 'fail') {
        return {
          label: t('sidecar.healthFailed', 'sidecar: ready, /health failed'),
          color: '#dc2626',
        };
      }
      return { label: t('sidecar.probing', 'sidecar: ready, probing…'), color: '#ca8a04' };
    case 'restarting':
      return {
        label: t('sidecar.restarting', 'sidecar: restarting (attempt {{attempt}})', {
          attempt: status.attempt,
        }),
        color: '#ca8a04',
      };
    case 'failed':
      return {
        label: t('sidecar.failed', 'sidecar: failed — {{reason}}', { reason: status.reason }),
        color: '#dc2626',
      };
    case 'stopped':
      return { label: t('sidecar.stopped', 'sidecar: stopped'), color: '#6b7280' };
  }
}

// TODO(release): M0 验收占位，生产 release 前必须删除（含 <SidecarPill /> 挂载点与相关 i18n key）。
function SidecarPill() {
  const t = useT();
  const status = useSidecarStatus();
  const [health, setHealth] = useState<HealthState>('unknown');

  useEffect(() => {
    if (!isReady(status)) {
      setHealth('unknown');
      return;
    }
    setHealth('probing');
    const client = createApiClient({ url: status.url, token: status.token });
    let cancelled = false;
    void (async () => {
      try {
        await client.getJson<HealthResponse>('/health');
        if (!cancelled) setHealth('ok');
      } catch {
        if (!cancelled) setHealth('fail');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const { label, color } = describeStatus(t, status, health);
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 12,
        right: 12,
        zIndex: 10,
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 12,
        background: 'rgba(0,0,0,0.7)',
        color,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        pointerEvents: 'none',
      }}
    >
      {label}
    </div>
  );
}

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
  const [accountOpen] = useState(false);
  const status = useSidecarStatus();
  const apiClient = isReady(status)
    ? createApiClient({ url: status.url, token: status.token })
    : null;

  const startNewChat = useCallback((prompt: string) => {
    if (!prompt.trim()) return;
    setScreen({ kind: 'chat', intent: { kind: 'new', prompt } });
  }, []);

  const resumeChat = useCallback((threadId: string) => {
    setScreen({ kind: 'chat', intent: { kind: 'resume', threadId } });
  }, []);

  return (
    <I18nProvider>
      <ThemeProvider initial="system">
        <SidecarPill />
        {screen.kind === 'home' ? (
          <div className="app">
            <Sidebar
              activeNav="new"
              onOpenSettings={() => setScreen({ kind: 'settings', section: 'general' })}
            />
            <main className="main">
              <Home composer={{ onSubmit: startNewChat }} />
              <RecentThreadsPanel apiClient={apiClient} onResume={resumeChat} />
            </main>
            {accountOpen ? (
              <div style={{ position: 'absolute', left: 24, bottom: 54, zIndex: 5 }}>
                <AccountPopover email="hi@jicai.us" />
              </div>
            ) : null}
          </div>
        ) : screen.kind === 'chat' ? (
          <ChatScreen intent={screen.intent} onBackHome={() => setScreen({ kind: 'home' })} />
        ) : (
          <SettingsScreen
            section={screen.section}
            onSelectSection={(section) => setScreen({ kind: 'settings', section })}
            onBack={() => setScreen({ kind: 'home' })}
            renderSection={(id) => (id === 'provider' ? <ProvidersSettingsSection /> : null)}
          />
        )}
      </ThemeProvider>
    </I18nProvider>
  );
}

function RecentThreadsPanel({
  apiClient,
  onResume,
}: {
  apiClient: ApiClient | null;
  onResume: (threadId: string) => void;
}) {
  const t = useT();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);

  useEffect(() => {
    if (!apiClient) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiClient.getJson<ListThreadsResponse>('/threads');
        if (!cancelled) setThreads(data.threads.slice(0, 6));
      } catch {
        if (!cancelled) setThreads([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  if (threads.length === 0) return null;

  return (
    <section
      style={{
        padding: '12px 24px 24px',
        borderTop: '1px solid var(--border, rgba(255,255,255,0.08))',
      }}
    >
      <h3 style={{ fontSize: 12, opacity: 0.7, margin: '0 0 8px', fontWeight: 600 }}>
        {t('home.recentThreads.title', 'Recent threads')}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {threads.map((th) => (
          <button
            type="button"
            key={th.id}
            onClick={() => onResume(th.id)}
            style={{
              textAlign: 'left',
              background: 'transparent',
              border: '1px solid var(--border, rgba(255,255,255,0.08))',
              borderRadius: 6,
              padding: '8px 10px',
              cursor: 'pointer',
              fontSize: 13,
              color: 'inherit',
            }}
          >
            <div style={{ fontWeight: 500 }}>
              {th.title ?? t('home.recentThreads.untitled', '(untitled)')}
            </div>
            <div style={{ fontSize: 11, opacity: 0.55 }}>
              {new Date(th.updatedAt).toLocaleString()}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
