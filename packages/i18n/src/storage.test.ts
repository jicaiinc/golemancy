import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultLocale } from './index.js';
import { detectLocale, getStoredLocale, setStoredLocale } from './storage.js';

function installStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  return values;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('locale storage', () => {
  it('persists supported locales and ignores unsupported values', () => {
    const values = installStorage();

    setStoredLocale('en');
    expect(getStoredLocale()).toBe('en');

    values.set('golemancy.locale', 'fr');
    expect(getStoredLocale()).toBeUndefined();
  });

  it('resolves stored locale before navigator and falls back to default locale', () => {
    installStorage();
    vi.stubGlobal('navigator', { languages: ['en-US'] });

    expect(detectLocale()).toBe('en');
    setStoredLocale('zh-CN');
    expect(detectLocale()).toBe('zh-CN');

    setStoredLocale('auto');
    vi.stubGlobal('navigator', { languages: ['fr-FR'] });
    expect(detectLocale()).toBe(defaultLocale);
  });
});
