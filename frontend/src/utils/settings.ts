import type { Locale } from '../i18n/translations';

/** Global UI settings (persisted in localStorage). */

export type Theme = 'light' | 'dark';

export interface AppSettings {
  collapseThreshold: number;
  locale: Locale;
  theme: Theme;
  sidebarCollapsed: boolean;
  /** Sidebar width in px; minimum is SIDEBAR_MIN_WIDTH. */
  sidebarWidth: number;
}

const STORAGE_KEY = 'mrv.settings';

/** Default and minimum sidebar width (px). */
export const SIDEBAR_MIN_WIDTH = 280;
export const SIDEBAR_MAX_WIDTH = 560;

export const DEFAULT_SETTINGS: AppSettings = {
  collapseThreshold: 40,
  locale: 'ru',
  theme: 'light',
  sidebarCollapsed: false,
  sidebarWidth: SIDEBAR_MIN_WIDTH,
};

function clampSidebarWidth(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.sidebarWidth;
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(n)));
}

export function loadAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings & { depthScale?: number }>;
    const locale = parsed.locale === 'en' || parsed.locale === 'ru' ? parsed.locale : DEFAULT_SETTINGS.locale;
    const theme = parsed.theme === 'dark' || parsed.theme === 'light' ? parsed.theme : DEFAULT_SETTINGS.theme;
    return {
      collapseThreshold: parsed.collapseThreshold ?? DEFAULT_SETTINGS.collapseThreshold,
      locale,
      theme,
      sidebarCollapsed: parsed.sidebarCollapsed === true,
      sidebarWidth: clampSidebarWidth(parsed.sidebarWidth),
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
