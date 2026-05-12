import { useEffect } from 'react';
import { initReactI18next, useTranslation as useI18nextTranslation } from 'react-i18next';
import {
  i18next,
  initI18n,
  setLocale,
  defaultNS,
  supportedLocales,
  type Locale,
} from './index.js';
import { detectLocale, setStoredLocale } from './storage.js';

let reactBindingInstalled = false;

function ensureReactBinding(): void {
  if (reactBindingInstalled) return;
  i18next.use(initReactI18next);
  reactBindingInstalled = true;
  void initI18n({ lng: detectLocale() });
}

ensureReactBinding();

export type { Locale };

export type Translator = (
  key: string,
  fallback: string,
  vars?: Record<string, unknown>,
) => string;

export function useT(): Translator {
  const { t } = useI18nextTranslation(defaultNS);
  return (key, fallback, vars) => t(key, { defaultValue: fallback, ...vars });
}

export function useLocale(): Locale {
  const { i18n } = useI18nextTranslation(defaultNS);
  return (i18n.resolvedLanguage ?? i18n.language ?? 'zh-CN') as Locale;
}

export function useSyncLocale(locale: Locale | undefined): void {
  useEffect(() => {
    if (!locale) return;
    if (i18next.language === locale) return;
    void setLocale(locale);
  }, [locale]);
}

// Convenience: switch live locale AND persist the choice. Pass 'auto' to
// clear the stored preference and re-resolve via navigator inference.
export function setLocalePersisted(locale: Locale | 'auto'): Promise<unknown> {
  setStoredLocale(locale);
  if (locale === 'auto') {
    return setLocale(detectLocale());
  }
  return setLocale(locale);
}

export { initI18n, setLocale, supportedLocales };
