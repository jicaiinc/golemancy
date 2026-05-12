import { useT } from '@golemancy/ui';
import { useEffect, useState } from 'react';
import type { ApiClient } from '../lib/api-client.js';
import { SECRET_ACCOUNTS, deleteSecret, getSecretStatus, saveSecret } from '../lib/secret.js';

type KeyState = 'loading' | 'absent' | 'present' | 'editing' | 'saving' | 'error';

export type ProvidersSettingsSectionProps = {
  apiClient: ApiClient | null;
};

export function ProvidersSettingsSection({ apiClient }: ProvidersSettingsSectionProps) {
  const t = useT();
  const [state, setState] = useState<KeyState>('loading');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [maskedHint, setMaskedHint] = useState<string | null>(null);

  useEffect(() => {
    if (!apiClient) return;
    let cancelled = false;
    void (async () => {
      try {
        const status = await getSecretStatus(apiClient, SECRET_ACCOUNTS.openaiApiKey);
        if (cancelled) return;
        if (status.present) {
          setState('present');
          setMaskedHint(status.masked ?? null);
        } else {
          setState('absent');
        }
      } catch (err) {
        if (cancelled) return;
        setState('error');
        setError(formatError(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  const save = async () => {
    if (!apiClient || !draft.trim()) return;
    setState('saving');
    setError(null);
    try {
      const res = await saveSecret(apiClient, SECRET_ACCOUNTS.openaiApiKey, draft.trim());
      setMaskedHint(res.masked ?? null);
      setDraft('');
      setState('present');
    } catch (err) {
      setError(formatError(err));
      setState('error');
    }
  };

  const remove = async () => {
    if (!apiClient) return;
    try {
      await deleteSecret(apiClient, SECRET_ACCOUNTS.openaiApiKey);
      setMaskedHint(null);
      setDraft('');
      setState('absent');
    } catch (err) {
      setError(formatError(err));
      setState('error');
    }
  };

  return (
    <>
      <h2 className="page__title">{t('settings.providers.title', 'Providers')}</h2>
      <section className="sgroup">
        <header className="sgroup__head">
          <h3 className="sgroup__label">{t('settings.providers.openai.title', 'OpenAI')}</h3>
          <p className="sgroup__hint">
            {t(
              'settings.providers.openai.hint',
              'Stored in the OS keychain. The sidecar reads it just-in-time and never exposes plaintext over HTTP.',
            )}
          </p>
        </header>
        <div className="sgroup__body">
          {state === 'present' && draft.length === 0 ? (
            <div className="srow">
              <div className="srow__text">
                <div className="srow__title">
                  {t('settings.providers.openai.keyLabel', 'API key')}
                </div>
                <div className="srow__desc">{maskedHint ?? ''}</div>
              </div>
              <div className="srow__ctrl" style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="select"
                  onClick={() => {
                    setState('editing');
                    setDraft('');
                  }}
                >
                  {t('settings.providers.openai.replace', 'Replace')}
                </button>
                <button type="button" className="select" onClick={() => void remove()}>
                  {t('settings.providers.openai.remove', 'Remove')}
                </button>
              </div>
            </div>
          ) : (
            <div className="srow" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div className="srow__text">
                <div className="srow__title">
                  {t('settings.providers.openai.keyLabel', 'API key')}
                </div>
                <div className="srow__desc">
                  {t(
                    'settings.providers.openai.inputHint',
                    'Paste a key that starts with sk-. The sidecar saves it to the OS keychain.',
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input
                  type="password"
                  value={draft}
                  placeholder="sk-..."
                  onChange={(e) => setDraft(e.currentTarget.value)}
                  style={{
                    flex: 1,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 13,
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border, rgba(255,255,255,0.12))',
                    background: 'var(--surface-2, rgba(0,0,0,0.2))',
                    color: 'inherit',
                  }}
                />
                <button
                  type="button"
                  className="select"
                  disabled={!draft.trim() || state === 'saving' || !apiClient}
                  onClick={() => void save()}
                >
                  {state === 'saving'
                    ? t('settings.providers.openai.saving', 'Saving…')
                    : t('settings.providers.openai.save', 'Save')}
                </button>
                {state === 'editing' ? (
                  <button
                    type="button"
                    className="select"
                    onClick={() => {
                      setDraft('');
                      setState(maskedHint ? 'present' : 'absent');
                    }}
                  >
                    {t('settings.providers.openai.cancel', 'Cancel')}
                  </button>
                ) : null}
              </div>
              {error ? (
                <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626' }}>{error}</div>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
