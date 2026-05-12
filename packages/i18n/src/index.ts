import i18next, { type i18n as I18nInstance } from 'i18next';
import './types.js';
import zhCNUi from './locales/zh-CN/ui.json' with { type: 'json' };
import enUi from './locales/en/ui.json' with { type: 'json' };

export const supportedLocales = ['zh-CN', 'en'] as const;
export type Locale = (typeof supportedLocales)[number];

export const defaultLocale: Locale = 'zh-CN';
export const defaultNS = 'ui' as const;

export const resources = {
  'zh-CN': { ui: zhCNUi },
  en: { ui: enUi },
} as const;

export type Resources = (typeof resources)['zh-CN'];

let initPromise: Promise<I18nInstance> | undefined;

export function initI18n(options?: { lng?: Locale }): Promise<I18nInstance> {
  let promise = initPromise;
  if (!promise) {
    promise = i18next
      .init({
        lng: options?.lng ?? defaultLocale,
        fallbackLng: defaultLocale,
        defaultNS,
        ns: [defaultNS],
        resources,
        returnNull: false,
        returnEmptyString: false,
        interpolation: { escapeValue: false },
        react: { useSuspense: false },
      })
      .then(() => i18next);
    initPromise = promise;
  }
  if (options?.lng && i18next.language !== options.lng) {
    void i18next.changeLanguage(options.lng);
  }
  return promise;
}

export function setLocale(lng: Locale): Promise<unknown> {
  return i18next.changeLanguage(lng);
}

export * from './storage.js';

export { i18next };
