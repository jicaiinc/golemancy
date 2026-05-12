import { defaultLocale, supportedLocales, type Locale } from './index.js';

const STORAGE_KEY = 'golemancy.locale';

function isLocale(value: string): value is Locale {
  return (supportedLocales as readonly string[]).includes(value);
}

export function getStoredLocale(): Locale | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw && isLocale(raw) ? raw : undefined;
}

export function setStoredLocale(locale: Locale | 'auto'): void {
  if (typeof localStorage === 'undefined') return;
  if (locale === 'auto') {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, locale);
}

// Maps `navigator.language` (e.g. "zh-CN", "zh-Hans-CN", "en-US", "fr") to a
// supported Locale, or falls back to defaultLocale.
function inferFromNavigator(): Locale | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const candidates: ReadonlyArray<string> = navigator.languages?.length
    ? navigator.languages
    : navigator.language
      ? [navigator.language]
      : [];
  for (const raw of candidates) {
    if (!raw) continue;
    if (isLocale(raw)) return raw;
    const head = raw.toLowerCase().split('-')[0];
    if (head === 'zh') return 'zh-CN';
    if (head === 'en') return 'en';
  }
  return undefined;
}

// Resolution order: explicit storage > navigator inference > defaultLocale.
export function detectLocale(): Locale {
  return getStoredLocale() ?? inferFromNavigator() ?? defaultLocale;
}
