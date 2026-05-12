import type { ReactNode } from 'react';
import {
  setLocale,
  setLocalePersisted,
  supportedLocales,
  useLocale,
  useSyncLocale,
  useT,
  type Locale,
  type Translator,
} from '@golemancy/i18n/react';
import {
  defaultLocale,
  detectLocale,
  getStoredLocale,
  setStoredLocale,
} from '@golemancy/i18n';

export type { Locale, Translator };
export {
  defaultLocale,
  detectLocale,
  getStoredLocale,
  setLocale,
  setLocalePersisted,
  setStoredLocale,
  supportedLocales,
  useLocale,
  useT,
};

export type I18nProviderProps = {
  locale?: Locale;
  children: ReactNode;
};

export function I18nProvider({ locale, children }: I18nProviderProps) {
  useSyncLocale(locale);
  return <>{children}</>;
}
