/** Global UI settings (persisted in localStorage). */

export interface AppSettings {
  collapseThreshold: number;
  depthScale: number;
}

const STORAGE_KEY = 'mrv.settings';

export const DEFAULT_SETTINGS: AppSettings = {
  collapseThreshold: 40,
  depthScale: 0.85,
};

export function loadAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      collapseThreshold: parsed.collapseThreshold ?? DEFAULT_SETTINGS.collapseThreshold,
      depthScale: parsed.depthScale ?? DEFAULT_SETTINGS.depthScale,
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
