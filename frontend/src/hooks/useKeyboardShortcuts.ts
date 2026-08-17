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
  showActionHistory: boolean;
  hasScheme: boolean;
  canUndo: boolean;
  canRedo: boolean;
};

/**
 * Global shortcuts:
 * - Ctrl/Cmd+F — open search on the scheme (when allowed)
 * - Ctrl/Cmd+Z — step back in action history
 * - Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y — step forward in action history
 * - F — toggle fullscreen (skipped while typing in a field)
 */
export function useKeyboardShortcuts(
  locks: KeyboardShortcutLocks,
  onOpenSearch: () => void,
  onToggleFullscreen?: () => void,
  onUndo?: () => void,
  onRedo?: () => void,
) {
  const locksRef = useRef(locks);
  locksRef.current = locks;
  const onOpenSearchRef = useRef(onOpenSearch);
  onOpenSearchRef.current = onOpenSearch;
  const onToggleFullscreenRef = useRef(onToggleFullscreen);
  onToggleFullscreenRef.current = onToggleFullscreen;
  const onUndoRef = useRef(onUndo);
  onUndoRef.current = onUndo;
  const onRedoRef = useRef(onRedo);
  onRedoRef.current = onRedo;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        const L = locksRef.current;
        if (e.repeat || L.serverDown || !L.hasScheme) return;
        if (e.shiftKey) {
          if (!L.canRedo) return;
          const redo = onRedoRef.current;
          if (!redo) return;
          e.preventDefault();
          redo();
          return;
        }
        if (!L.canUndo) return;
        const undo = onUndoRef.current;
        if (!undo) return;
        e.preventDefault();
        undo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
        const L = locksRef.current;
        if (e.repeat || L.serverDown || !L.hasScheme || !L.canRedo) return;
        const redo = onRedoRef.current;
        if (!redo) return;
        e.preventDefault();
        redo();
        return;
      }

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
        || L.showNotifications
        || L.showActionHistory,
      );
      if (blocked || !L.hasScheme) return;
      e.preventDefault();
      if (!L.showSearch) onOpenSearchRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
