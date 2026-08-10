import { useCallback, useEffect, useRef, useState } from 'react';
import { checkForUpdates } from '../api';
import type { AppNotification } from '../components/NotificationsBell';
import type { Scheme } from '../types';
import type { FlagConflictsResult, SpatialConflict } from '../utils/flagConflicts';
import {
  buildExportErrorNotifications,
  isExportErrorNotification,
} from '../utils/exportErrorNotifications';
import { isUpdateTagDismissed } from '../utils/updateDismiss';
import {
  clearPersistedNotifications,
  keepUpdateNotifications,
  preserveNotificationReadState,
  rememberDismissedUpdate,
} from './notificationHelpers';
import { formatFlagValueShort } from '../utils/flagRows';

type OverwriteView = { flagName: string; parentId: string; childId: string } | null;

type ConflictViewSetters = {
  setConflictSchemeView: React.Dispatch<React.SetStateAction<SpatialConflict | null>>;
  setOverwriteSchemeView: React.Dispatch<React.SetStateAction<OverwriteView>>;
};

/**
 * Sync spatial/overwrite/orphan/height conflicts into the bell + toast stack.
 * Also seeds the one-time update notice and clears legacy localStorage keys.
 */
export function useConflictNotifications(
  scheme: Scheme | null,
  flagConflicts: FlagConflictsResult | null,
  orphanIds: Set<string>,
  nonStandardHeightIds: Set<string>,
  viewSetters: ConflictViewSetters,
) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationToasts, setNotificationToasts] = useState<AppNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifiedConflictKeysRef = useRef<Set<string>>(new Set());
  /** Scheme for which current conflict keys were seeded (load: only ambiguous → bell). */
  const conflictNotifySeededForRef = useRef<string | null>(null);
  /** Next notification sync replaces the list but skips toast popups. */
  const quietNotificationReseedRef = useRef(false);
  const [notificationRefreshSeq, setNotificationRefreshSeq] = useState(0);
  const [exportBlockedFlashTick, setExportBlockedFlashTick] = useState(0);
  const [exportBlockedFlashCount, setExportBlockedFlashCount] = useState(0);
  const viewSettersRef = useRef(viewSetters);
  viewSettersRef.current = viewSetters;

  useEffect(() => {
    clearPersistedNotifications();
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      const info = await checkForUpdates(ctrl.signal);
      if (ctrl.signal.aborted || !info?.outdated || !info.latest) return;
      if (isUpdateTagDismissed(info.latest)) return;
      const highlights = (info.highlights ?? []).filter((s) => typeof s === 'string' && s.trim());
      const detail = highlights.length > 0
        ? highlights.map((s) => `• ${s}`).join('\n')
        : undefined;
      const toast: AppNotification = {
        id: `update|${info.latest}|${Date.now()}`,
        createdAt: Date.now(),
        level: 'warning',
        kind: 'update',
        conflictKey: `update|${info.latest}`,
        titleKey: 'notifications.updateTitle',
        bodyKey: 'notifications.updateBody',
        params: { current: info.current, latest: info.latest },
        detail,
        url: info.html_url,
        read: false,
      };
      setNotifications((prev) => {
        if (prev.some((n) => n.kind === 'update' && n.conflictKey === toast.conflictKey)) return prev;
        const withoutOld = prev.filter((n) => n.kind !== 'update');
        return [toast, ...withoutOld].slice(0, 100);
      });
      setNotificationToasts((prev) => {
        const withoutOld = prev.filter((n) => n.kind !== 'update');
        return [toast, ...withoutOld].slice(0, 5);
      });
      window.setTimeout(() => {
        setNotificationToasts((prev) => prev.filter((item) => item.id !== toast.id));
      }, 20000);
    })();
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    if (!scheme) {
      conflictNotifySeededForRef.current = null;
      notifiedConflictKeysRef.current = new Set();
      return;
    }

    const schemeKey = scheme.sourceHash || 'default';
    const spatial = flagConflicts && flagConflicts.hardErrors.length === 0
      ? flagConflicts.spatialConflicts
      : [];
    const overwrites = flagConflicts && flagConflicts.hardErrors.length === 0
      ? flagConflicts.overwrites
      : [];
    const now = Date.now();
    const fresh: AppNotification[] = [];
    const exportErrors = buildExportErrorNotifications(scheme, flagConflicts, { includeManual: true }, now);

    const spatialKey = (c: SpatialConflict) =>
      `sp|${c.flagName}|${c.aId}|${c.bId}|${c.relation}`;
    const overwriteKey = (o: { flagName: string; parentId: string; childId: string }) =>
      `ow|${o.flagName}|${o.parentId}|${o.childId}`;
    const orphanKey = (id: string) => `or|${id}`;
    const heightKey = (id: string) => `ht|${id}`;

    const activeKeys = new Set<string>();
    for (const n of exportErrors) activeKeys.add(n.conflictKey);
    for (const c of spatial) activeKeys.add(spatialKey(c));
    for (const o of overwrites) activeKeys.add(overwriteKey(o));
    for (const id of orphanIds) activeKeys.add(orphanKey(id));
    for (const id of nonStandardHeightIds) activeKeys.add(heightKey(id));

    for (const key of [...notifiedConflictKeysRef.current]) {
      if (!activeKeys.has(key)) notifiedConflictKeysRef.current.delete(key);
    }

    const pushAmbiguous = (c: SpatialConflict, key: string) => {
      fresh.push({
        id: `${key}|${now}`,
        createdAt: now,
        level: 'error',
        kind: 'spatial',
        conflictKey: key,
        titleKey: 'notifications.ambiguousTitle',
        bodyKey: 'notifications.ambiguousBody',
        params: {
          flag: c.flagName,
          a: c.aId,
          b: c.bId,
          aValue: formatFlagValueShort(c.aValue),
          bValue: formatFlagValueShort(c.bValue),
        },
        flagName: c.flagName,
        aId: c.aId,
        bId: c.bId,
        relation: c.relation,
        read: false,
      });
    };

    const pushResolved = (c: SpatialConflict, key: string) => {
      fresh.push({
        id: `${key}|${now}`,
        createdAt: now,
        level: 'warning',
        kind: 'spatial',
        conflictKey: key,
        titleKey: 'notifications.resolvedTitle',
        bodyKey: 'notifications.resolvedBody',
        params: {
          flag: c.flagName,
          a: c.aId,
          b: c.bId,
          aValue: formatFlagValueShort(c.aValue),
          bValue: formatFlagValueShort(c.bValue),
          winner: c.winnerId ?? '?',
        },
        flagName: c.flagName,
        aId: c.aId,
        bId: c.bId,
        relation: c.relation,
        read: false,
      });
    };

    const pushOverwrite = (
      o: { flagName: string; parentId: string; childId: string; parentValue: unknown; childValue: unknown },
      key: string,
    ) => {
      fresh.push({
        id: `${key}|${now}`,
        createdAt: now,
        level: 'warning',
        kind: 'overwrite',
        conflictKey: key,
        titleKey: 'notifications.overwriteTitle',
        bodyKey: 'notifications.overwriteBody',
        params: {
          flag: o.flagName,
          child: o.childId,
          childValue: formatFlagValueShort(o.childValue),
          parent: o.parentId,
          parentValue: formatFlagValueShort(o.parentValue),
        },
        flagName: o.flagName,
        aId: o.parentId,
        bId: o.childId,
        read: false,
      });
    };

    const pushOrphan = (id: string, key: string) => {
      fresh.push({
        id: `${key}|${now}`,
        createdAt: now,
        level: 'warning',
        kind: 'orphan',
        conflictKey: key,
        titleKey: 'notifications.orphanTitle',
        bodyKey: 'notifications.orphanBody',
        params: { id },
        aId: id,
        read: false,
      });
    };

    const pushHeight = (id: string, key: string) => {
      fresh.push({
        id: `${key}|${now}`,
        createdAt: now,
        level: 'warning',
        kind: 'height',
        conflictKey: key,
        titleKey: 'notifications.heightTitle',
        bodyKey: 'notifications.heightBody',
        params: { id },
        aId: id,
        read: false,
      });
    };

    const isReseed = conflictNotifySeededForRef.current !== schemeKey;

    if (isReseed) {
      conflictNotifySeededForRef.current = schemeKey;
      notifiedConflictKeysRef.current = new Set();
      for (const c of spatial) {
        const key = spatialKey(c);
        notifiedConflictKeysRef.current.add(key);
        if (c.ambiguous) pushAmbiguous(c, key);
      }
      for (const o of overwrites) {
        const key = overwriteKey(o);
        notifiedConflictKeysRef.current.add(key);
        pushOverwrite(o, key);
      }
      for (const id of orphanIds) {
        const key = orphanKey(id);
        notifiedConflictKeysRef.current.add(key);
        pushOrphan(id, key);
      }
      for (const id of nonStandardHeightIds) {
        const key = heightKey(id);
        notifiedConflictKeysRef.current.add(key);
        pushHeight(id, key);
      }
    } else {
      for (const c of spatial) {
        const key = spatialKey(c);
        if (notifiedConflictKeysRef.current.has(key)) continue;
        notifiedConflictKeysRef.current.add(key);
        if (c.ambiguous) pushAmbiguous(c, key);
        else pushResolved(c, key);
      }
      for (const o of overwrites) {
        const key = overwriteKey(o);
        if (notifiedConflictKeysRef.current.has(key)) continue;
        notifiedConflictKeysRef.current.add(key);
        pushOverwrite(o, key);
      }
      for (const id of orphanIds) {
        const key = orphanKey(id);
        if (notifiedConflictKeysRef.current.has(key)) continue;
        notifiedConflictKeysRef.current.add(key);
        pushOrphan(id, key);
      }
      for (const id of nonStandardHeightIds) {
        const key = heightKey(id);
        if (notifiedConflictKeysRef.current.has(key)) continue;
        notifiedConflictKeysRef.current.add(key);
        pushHeight(id, key);
      }
    }

    setNotifications((prev) => {
      const keep = keepUpdateNotifications(prev);
      const withoutExport = prev.filter((n) => !isExportErrorNotification(n));
      const exportErrorsMerged = preserveNotificationReadState(prev, exportErrors);
      const freshMerged = preserveNotificationReadState(prev, fresh);
      if (isReseed) return [...keep, ...exportErrorsMerged, ...freshMerged].slice(0, 100);
      const pruned = withoutExport.filter(
        (n) => n.kind === 'update' || !n.conflictKey || activeKeys.has(n.conflictKey),
      );
      if (freshMerged.length === 0 && exportErrorsMerged.length === 0) return pruned;
      return [...exportErrorsMerged, ...freshMerged, ...pruned].slice(0, 100);
    });

    viewSettersRef.current.setConflictSchemeView((current) => {
      if (!current) return current;
      const key = `sp|${current.flagName}|${current.aId}|${current.bId}|${current.relation}`;
      return activeKeys.has(key) ? current : null;
    });
    viewSettersRef.current.setOverwriteSchemeView((current) => {
      if (!current) return current;
      const key = `ow|${current.flagName}|${current.parentId}|${current.childId}`;
      return activeKeys.has(key) ? current : null;
    });

    const quiet = quietNotificationReseedRef.current;
    if (quiet) quietNotificationReseedRef.current = false;

    setNotificationToasts((prev) => {
      const keep = keepUpdateNotifications(prev);
      if (quiet) return keep;
      if (isReseed) return [...keep, ...fresh].slice(0, 5);
      const pruned = prev.filter(
        (n) => n.kind === 'update' || !n.conflictKey || activeKeys.has(n.conflictKey),
      );
      return fresh.length > 0 ? [...fresh, ...pruned].slice(0, 5) : pruned;
    });
    if (!quiet && fresh.length > 0) {
      for (const item of fresh) {
        window.setTimeout(() => {
          setNotificationToasts((prev) => prev.filter((toast) => toast.id !== item.id));
        }, 9500);
      }
    }
  }, [flagConflicts, scheme, orphanIds, nonStandardHeightIds, notificationRefreshSeq]);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => {
      const target = prev.find((n) => n.id === id);
      if (target) rememberDismissedUpdate(target);
      return prev.filter((n) => n.id !== id);
    });
    setNotificationToasts((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const dismissAllToasts = useCallback(() => {
    setNotificationToasts([]);
  }, []);

  const handleRefreshNotifications = useCallback(() => {
    if (!scheme) return;
    quietNotificationReseedRef.current = true;
    conflictNotifySeededForRef.current = null;
    setNotificationRefreshSeq((n) => n + 1);
  }, [scheme]);

  const handleRefreshExportErrors = useCallback(() => {
    if (!scheme) return;
    setNotificationRefreshSeq((n) => n + 1);
  }, [scheme]);

  const triggerExportBlockedFlash = useCallback((errorCount: number) => {
    setExportBlockedFlashCount(errorCount);
    setExportBlockedFlashTick((n) => n + 1);
  }, []);

  const resetNotificationSchemeState = useCallback(() => {
    conflictNotifySeededForRef.current = null;
    notifiedConflictKeysRef.current = new Set();
    setNotifications((prev) => keepUpdateNotifications(prev));
    setNotificationToasts((prev) => keepUpdateNotifications(prev));
    setShowNotifications(false);
  }, []);

  const prepareFreshSchemeNotifications = useCallback(() => {
    conflictNotifySeededForRef.current = null;
    setNotifications((prev) => keepUpdateNotifications(prev));
    setNotificationToasts((prev) => keepUpdateNotifications(prev));
  }, []);

  const pushInfoToast = useCallback((toast: AppNotification) => {
    setNotificationToasts((prev) => [...prev, toast]);
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
    setNotificationToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const markAllRead = useCallback((level: 'error' | 'warning') => {
    setNotifications((prev) => prev.map((n) => (n.level === level ? { ...n, read: true } : n)));
  }, []);

  const clearWarningNotifications = useCallback(() => {
    setNotifications((prev) => {
      for (const n of prev) {
        if (n.level === 'warning') rememberDismissedUpdate(n);
      }
      return prev.filter((n) => n.level !== 'warning');
    });
    setNotificationToasts((prev) => prev.filter((n) => n.level !== 'warning'));
  }, []);

  return {
    notifications,
    setNotifications,
    notificationToasts,
    setNotificationToasts,
    showNotifications,
    setShowNotifications,
    conflictNotifySeededForRef,
    notifiedConflictKeysRef,
    quietNotificationReseedRef,
    dismissNotification,
    dismissAllToasts,
    handleRefreshNotifications,
    resetNotificationSchemeState,
    prepareFreshSchemeNotifications,
    pushInfoToast,
    markNotificationRead,
    markAllRead,
    clearWarningNotifications,
    exportBlockedFlashTick,
    exportBlockedFlashCount,
    handleRefreshExportErrors,
    triggerExportBlockedFlash,
  };
}
