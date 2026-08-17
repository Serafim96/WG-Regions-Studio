import { useCallback, useRef, useState } from 'react';
import type { Scheme } from '../types';

const MAX_ENTRIES = 50;

export type SchemeActionKind =
  | 'initial'
  | 'addRegion'
  | 'deleteRegion'
  | 'updateFlags'
  | 'updateParent'
  | 'updateGeometry'
  | 'renameRegion'
  | 'updatePriority'
  | 'updateMembers'
  | 'bulkFlags'
  | 'clearAllFlags'
  | 'saveRegion';

export interface SchemeHistoryEntry {
  id: string;
  kind: SchemeActionKind;
  labelKey: string;
  labelParams?: Record<string, string | number>;
  scheme: Scheme;
}

function cloneScheme(scheme: Scheme): Scheme {
  return structuredClone(scheme);
}

function schemesEqual(a: Scheme, b: Scheme): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

let nextEntryId = 1;
function genEntryId(): string {
  nextEntryId += 1;
  return `history-${nextEntryId}`;
}

/** Timeline of scheme edits with labels (undo/redo + action list). Memory only. */
export function useSchemeHistory() {
  const entriesRef = useRef<SchemeHistoryEntry[]>([]);
  const indexRef = useRef(-1);
  const [revision, setRevision] = useState(0);

  const bump = useCallback(() => setRevision((r) => r + 1), []);

  const resetWithInitial = useCallback((scheme: Scheme, labelKey = 'history.initial') => {
    const entry: SchemeHistoryEntry = {
      id: genEntryId(),
      kind: 'initial',
      labelKey,
      scheme: cloneScheme(scheme),
    };
    entriesRef.current = [entry];
    indexRef.current = 0;
    bump();
  }, [bump]);

  const clear = useCallback(() => {
    entriesRef.current = [];
    indexRef.current = -1;
    bump();
  }, [bump]);

  const isAtHead = useCallback((): boolean => {
    const entries = entriesRef.current;
    const idx = indexRef.current;
    return entries.length === 0 || idx === entries.length - 1;
  }, []);

  const truncateFuture = useCallback(() => {
    const idx = indexRef.current;
    if (idx < 0) return;
    entriesRef.current = entriesRef.current.slice(0, idx + 1);
    bump();
  }, [bump]);

  const recordAction = useCallback((
    scheme: Scheme,
    meta: Pick<SchemeHistoryEntry, 'kind' | 'labelKey' | 'labelParams'>,
  ): boolean => {
    const copy = cloneScheme(scheme);
    const entries = entriesRef.current;
    const idx = indexRef.current;
    const base = idx >= 0 ? entries.slice(0, idx + 1) : [];
    const last = base[base.length - 1];
    if (last && schemesEqual(last.scheme, copy)) return false;

    const entry: SchemeHistoryEntry = {
      id: genEntryId(),
      ...meta,
      scheme: copy,
    };
    let next = [...base, entry];
    if (next.length > MAX_ENTRIES) {
      const initial = next[0];
      next = [initial, ...next.slice(next.length - (MAX_ENTRIES - 1))];
    }
    entriesRef.current = next;
    indexRef.current = next.length - 1;
    bump();
    return true;
  }, [bump]);

  const goToIndex = useCallback((target: number): Scheme | null => {
    const entries = entriesRef.current;
    if (target < 0 || target >= entries.length) return null;
    indexRef.current = target;
    bump();
    return cloneScheme(entries[target].scheme);
  }, [bump]);

  const entries = entriesRef.current;
  const currentIndex = indexRef.current;

  return {
    resetWithInitial,
    clear,
    recordAction,
    truncateFuture,
    isAtHead,
    goToIndex,
    canGoBack: currentIndex > 0,
    canGoForward: currentIndex >= 0 && currentIndex < entries.length - 1,
    currentIndex,
    entries,
    revision,
    hasHistory: entries.length > 0,
  };
}
