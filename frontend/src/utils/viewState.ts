/** Persist graph view state in localStorage (separate from .mrv.json scheme). */

export interface ViewState {
  hiddenNodes: string[];
  depthScale: number;
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
    return JSON.parse(raw) as ViewState;
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
