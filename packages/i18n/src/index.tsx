import { i18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

export const supportedLocales = ["en-US", "zh-CN"] as const;
export type AppLocale = (typeof supportedLocales)[number];

export const defaultLocale: AppLocale = "en-US";
export const localeStorageKey = "golemancy.locale";

export interface LocaleOption {
  locale: AppLocale;
  nativeLabel: string;
  englishLabel: string;
}

export const localeOptions: LocaleOption[] = [
  { locale: "en-US", nativeLabel: "English", englishLabel: "English" },
  { locale: "zh-CN", nativeLabel: "简体中文", englishLabel: "Simplified Chinese" },
];

type CatalogModule = {
  messages: Messages;
};

const catalogLoaders: Record<AppLocale, () => Promise<CatalogModule>> = {
  "en-US": () => import("./locales/en-US/messages"),
  "zh-CN": () => import("./locales/zh-CN/messages"),
};

const loadedLocales = new Set<AppLocale>();

export function normalizeLocale(locale: string | null | undefined): AppLocale | null {
  if (!locale) {
    return null;
  }

  const normalized = locale.trim().replace("_", "-");
  if (!normalized) {
    return null;
  }

  if (isSupportedLocale(normalized)) {
    return normalized;
  }

  const language = normalized.split("-")[0]?.toLowerCase();
  if (language === "en") {
    return "en-US";
  }
  if (language === "zh") {
    return "zh-CN";
  }

  return null;
}

export function detectPreferredLocale(candidates: readonly string[] = getNavigatorLanguages()): AppLocale {
  for (const candidate of candidates) {
    const locale = normalizeLocale(candidate);
    if (locale) {
      return locale;
    }
  }

  return defaultLocale;
}

export function readStoredLocale(storage: Storage | undefined = getLocalStorage()): AppLocale | null {
  return normalizeLocale(storage?.getItem(localeStorageKey));
}

export function writeStoredLocale(locale: AppLocale, storage: Storage | undefined = getLocalStorage()): void {
  storage?.setItem(localeStorageKey, locale);
}

export function resolveInitialLocale(storage: Storage | undefined = getLocalStorage()): AppLocale {
  return readStoredLocale(storage) ?? detectPreferredLocale();
}

export async function activateLocale(locale: AppLocale): Promise<AppLocale> {
  if (!loadedLocales.has(locale)) {
    const catalog = await catalogLoaders[locale]();
    i18n.load(locale, catalog.messages);
    loadedLocales.add(locale);
  }

  i18n.activate(locale);
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
  return locale;
}

export async function activateInitialLocale(): Promise<AppLocale> {
  return activateLocale(resolveInitialLocale());
}

export interface GolemancyI18nContextValue {
  locale: AppLocale;
  locales: readonly LocaleOption[];
  setLocale: (locale: AppLocale) => Promise<void>;
}

const GolemancyI18nContext = createContext<GolemancyI18nContextValue | null>(null);

export interface GolemancyI18nProviderProps {
  children: ReactNode;
  initialLocale: AppLocale;
}

export function GolemancyI18nProvider({ children, initialLocale }: GolemancyI18nProviderProps) {
  const [locale, setActiveLocale] = useState<AppLocale>(initialLocale);

  const setLocale = useCallback(async (nextLocale: AppLocale) => {
    const activated = await activateLocale(nextLocale);
    writeStoredLocale(activated);
    setActiveLocale(activated);
  }, []);

  const value = useMemo<GolemancyI18nContextValue>(
    () => ({
      locale,
      locales: localeOptions,
      setLocale,
    }),
    [locale, setLocale],
  );

  return (
    <GolemancyI18nContext.Provider value={value}>
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    </GolemancyI18nContext.Provider>
  );
}

export function useGolemancyI18n(): GolemancyI18nContextValue {
  const context = useContext(GolemancyI18nContext);
  if (!context) {
    throw new Error("useGolemancyI18n must be used inside GolemancyI18nProvider");
  }

  return context;
}

export function formatDateTime(value: string | number | Date, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatInteger(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

export function formatDuration(seconds: number, locale: AppLocale): string {
  if (seconds < 60) {
    return new Intl.NumberFormat(locale, { style: "unit", unit: "second", unitDisplay: "narrow" }).format(seconds);
  }

  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0) {
    const hoursText = new Intl.NumberFormat(locale, { style: "unit", unit: "hour", unitDisplay: "narrow" }).format(hours);
    const minutesText = new Intl.NumberFormat(locale, { style: "unit", unit: "minute", unitDisplay: "narrow" }).format(
      remainingMinutes,
    );
    return `${hoursText} ${minutesText}`;
  }

  return new Intl.NumberFormat(locale, { style: "unit", unit: "minute", unitDisplay: "narrow" }).format(minutes);
}

function isSupportedLocale(locale: string): locale is AppLocale {
  return supportedLocales.includes(locale as AppLocale);
}

function getNavigatorLanguages(): readonly string[] {
  if (typeof navigator === "undefined") {
    return [];
  }

  return navigator.languages.length > 0 ? navigator.languages : [navigator.language];
}

function getLocalStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
