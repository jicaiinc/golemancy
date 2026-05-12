import { useEffect, useMemo, useState } from 'react';
import {
  AccountPopover,
  Home,
  I18nProvider,
  Sidebar,
  SettingsScreen,
  ThemeProvider,
  useT,
  type SettingsSectionId,
  type SidebarProjectEntry,
  type SidebarThreadEntry,
  type Translator,
} from '@golemancy/ui';
import type { HealthResponse } from '@golemancy/protocol';
import { useSidecarStatus, type SidecarStatus } from './lib/sidecar';
import { createApiClient, isReady } from './lib/api-client';
import { chatKeyForActive, useChatStore } from './lib/chat-store';
import { ChatPanel } from './screens/Chat';
import { ProvidersSettingsSection } from './screens/ProvidersSettings';

type Screen = { kind: 'home' } | { kind: 'settings'; section: SettingsSectionId };

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
  const apiClient = useMemo(
    () => (isReady(status) ? createApiClient({ url: status.url, token: status.token }) : null),
    [status],
  );

  const store = useChatStore(apiClient);

  const sidebarProjects: SidebarProjectEntry[] = store.projects.map((p) => ({
    id: p.id,
    name: p.name,
  }));
  const sidebarThreadsByProject: Record<string, SidebarThreadEntry[]> = Object.fromEntries(
    Object.entries(store.threadsByProject).map(([pid, list]) => [
      pid,
      list.map((t) => ({
        id: t.id,
        title: t.title,
        status: store.sessionStatus[t.id] ?? 'idle',
      })),
    ]),
  );

  const activeKey = chatKeyForActive(store.activeRef);
  const activeChat = activeKey ? store.chats[activeKey] ?? null : null;

  const activeProjectName =
    store.activeProjectId != null
      ? store.projects.find((p) => p.id === store.activeProjectId)?.name ?? null
      : null;

  const activeThreadTitle = (() => {
    const ref = store.activeRef;
    if (!ref || ref.kind !== 'thread') return null;
    for (const list of Object.values(store.threadsByProject)) {
      const hit = list.find((t) => t.id === ref.threadId);
      if (hit) return hit.title;
    }
    return null;
  })();

  const onTopNewChat = () => {
    const target = store.activeProjectId ?? store.projects[0]?.id ?? null;
    if (!target) {
      void store.createProject().then((p) => {
        if (p) store.newDraftInProject(p.id);
      });
      return;
    }
    store.newDraftInProject(target);
  };

  return (
    <I18nProvider>
      <ThemeProvider initial="system">
        <SidecarPill />
        {screen.kind === 'home' ? (
          <div className="app">
            <Sidebar
              activeNav="new"
              projects={sidebarProjects}
              threadsByProject={sidebarThreadsByProject}
              drafts={store.drafts}
              activeRef={store.activeRef}
              onOpenSettings={() => setScreen({ kind: 'settings', section: 'general' })}
              onTopNewChat={onTopNewChat}
              onCreateProject={() => {
                void store.createProject().then((p) => {
                  if (p) store.newDraftInProject(p.id);
                });
              }}
              onRenameProject={(id, name) => void store.renameProject(id, name)}
              onDeleteProject={(id) => void store.deleteProject(id)}
              onNewChatInProject={(pid) => store.newDraftInProject(pid)}
              onSelectThread={(id) => store.selectThread(id)}
              onSelectDraft={(pid) => store.selectDraft(pid)}
              onRenameThread={(id, title) => void store.renameThread(id, title)}
              onDeleteThread={(id) => void store.deleteThread(id)}
            />
            <main className="main">
              {activeChat ? (
                <ChatPanel
                  state={activeChat}
                  title={activeThreadTitle}
                  projectName={activeProjectName}
                  isDraft={store.activeRef?.kind === 'draft'}
                  onSubmit={(text) => void store.sendMessage(text)}
                />
              ) : (
                <Home
                  composer={{
                    projectName: activeProjectName ?? undefined,
                    onSubmit: (text) => {
                      if (!store.activeProjectId) {
                        onTopNewChat();
                      }
                      void store.sendMessage(text);
                    },
                  }}
                />
              )}
            </main>
            {accountOpen ? (
              <div style={{ position: 'absolute', left: 24, bottom: 54, zIndex: 5 }}>
                <AccountPopover email="hi@jicai.us" />
              </div>
            ) : null}
          </div>
        ) : (
          <SettingsScreen
            section={screen.section}
            onSelectSection={(section) => setScreen({ kind: 'settings', section })}
            onBack={() => setScreen({ kind: 'home' })}
            renderSection={(id) =>
              id === 'provider' ? <ProvidersSettingsSection apiClient={apiClient} /> : null
            }
          />
        )}
      </ThemeProvider>
    </I18nProvider>
  );
}
