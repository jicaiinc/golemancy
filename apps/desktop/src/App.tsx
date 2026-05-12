import { useEffect, useState } from 'react';
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
import type { HealthResponse } from '@golemancy/protocol';
import { useSidecarStatus, type SidecarStatus } from './lib/sidecar';
import { createApiClient, isReady } from './lib/api-client';

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
        top: 12,
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
  const [accountOpen, setAccountOpen] = useState(false);

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
              <Home />
            </main>
            {accountOpen ? (
              <div
                style={{ position: 'absolute', left: 24, bottom: 54, zIndex: 5 }}
                onMouseLeave={() => setAccountOpen(false)}
              >
                <AccountPopover email="hi@jicai.us" />
              </div>
            ) : null}
          </div>
        ) : (
          <SettingsScreen
            section={screen.section}
            onSelectSection={(section) => setScreen({ kind: 'settings', section })}
            onBack={() => setScreen({ kind: 'home' })}
          />
        )}
      </ThemeProvider>
    </I18nProvider>
  );
}
