import type { Locale } from '../i18n/translations';

/** Global UI settings (persisted in localStorage). */

export interface AppSettings {
  collapseThreshold: number;
  locale: Locale;
}

const STORAGE_KEY = 'mrv.settings';

export const DEFAULT_SETTINGS: AppSettings = {
  collapseThreshold: 40,
  locale: 'ru',
};

export function loadAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings & { depthScale?: number }>;
    const locale = parsed.locale === 'en' || parsed.locale === 'ru' ? parsed.locale : DEFAULT_SETTINGS.locale;
    return {
      collapseThreshold: parsed.collapseThreshold ?? DEFAULT_SETTINGS.collapseThreshold,
      locale,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAppSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}
