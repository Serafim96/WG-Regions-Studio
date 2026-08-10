import { useEffect, useRef } from 'react';
import { isEditableTarget } from '../utils/isEditableTarget';

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
 * Global shortcuts:
 * - Ctrl/Cmd+F — open search on the scheme (when allowed)
 * - F — toggle fullscreen (skipped while typing in a field)
 */
export function useKeyboardShortcuts(
  locks: KeyboardShortcutLocks,
  onOpenSearch: () => void,
  onToggleFullscreen?: () => void,
) {
  const locksRef = useRef(locks);
  locksRef.current = locks;
  const onOpenSearchRef = useRef(onOpenSearch);
  onOpenSearchRef.current = onOpenSearch;
  const onToggleFullscreenRef = useRef(onToggleFullscreen);
  onToggleFullscreenRef.current = onToggleFullscreen;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

      if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.repeat || locksRef.current.serverDown) return;
        const toggle = onToggleFullscreenRef.current;
        if (!toggle) return;
        e.preventDefault();
        toggle();
        return;
      }

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
