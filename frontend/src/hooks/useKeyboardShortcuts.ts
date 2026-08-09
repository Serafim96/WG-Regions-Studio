import { useEffect, useRef } from 'react';

export type KeyboardShortcutLocks = {
  serverDown: boolean;
  detailsId: string | null;
  deleteTarget: unknown;
  showMetrics: boolean;
  showLegend: boolean;
  showFlagsCatalog: boolean;
  showFlagsManager: boolean;
  showFlagConflictsDialog: boolean;
  showAddDialog: boolean;
  showNotifications: boolean;
  showSearch: boolean;
  hasScheme: boolean;
};

/**
 * Ctrl/Cmd+F opens search from the main scheme view.
 * Snapshot of lock flags is kept in a ref so the listener stays stable.
 */
export function useKeyboardShortcuts(
  locks: KeyboardShortcutLocks,
  onOpenSearch: () => void,
) {
  const locksRef = useRef(locks);
  locksRef.current = locks;
  const onOpenSearchRef = useRef(onOpenSearch);
  onOpenSearchRef.current = onOpenSearch;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.code !== 'KeyF') return;
      const L = locksRef.current;
      const blocked = Boolean(
        L.serverDown
        || L.detailsId
        || L.deleteTarget
        || L.showMetrics
        || L.showLegend
        || L.showFlagsCatalog
        || L.showFlagsManager
        || L.showFlagConflictsDialog
        || L.showAddDialog
        || L.showNotifications,
      );
      if (blocked || !L.hasScheme) return;
      e.preventDefault();
      if (!L.showSearch) onOpenSearchRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
