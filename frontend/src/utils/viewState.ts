/** Persist graph view state in localStorage (separate from .mrv.json scheme). */

export interface ViewState {
  hiddenNodes: string[];
  collapseTarget: string | null;
}

const STORAGE_PREFIX = 'mrv.view.';

function storageKey(schemeKey: string): string {
  return `${STORAGE_PREFIX}${schemeKey || 'default'}`;
}

export function loadViewState(schemeKey: string): ViewState | null {
  try {
    const raw = localStorage.getItem(storageKey(schemeKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ViewState & { depthScale?: number };
    return {
      hiddenNodes: parsed.hiddenNodes ?? [],
      collapseTarget: parsed.collapseTarget ?? null,
    };
  } catch {
    return null;
  }
}

export function saveViewState(schemeKey: string, state: ViewState): void {
  try {
    localStorage.setItem(storageKey(schemeKey), JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

export function clearViewState(schemeKey: string): void {
  try {
    localStorage.removeItem(storageKey(schemeKey));
  } catch {
    // ignore
  }
}
