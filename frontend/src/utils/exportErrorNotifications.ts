import type { AppNotification } from '../components/NotificationsBell';
import type { FlagConflictsResult } from './flagConflicts';
import {
  findIncompleteManualRegions,
  findInvalidRegionIds,
} from './schemeValidation';
import type { Scheme } from '../types';

export const EXPORT_ERROR_KINDS = ['invalidId', 'cycle', 'incompleteManual'] as const;
export type ExportErrorKind = (typeof EXPORT_ERROR_KINDS)[number];

export function isExportErrorNotification(n: AppNotification): boolean {
  return (EXPORT_ERROR_KINDS as readonly string[]).includes(n.kind);
}

/** Export-blocking issues shown in the bell (ambiguous conflicts come from spatial sync). */
export function buildExportErrorNotifications(
  scheme: Scheme,
  flagConflicts: FlagConflictsResult | null,
  options: { includeManual: boolean },
  now = Date.now(),
): AppNotification[] {
  const out: AppNotification[] = [];

  for (const id of findInvalidRegionIds(scheme)) {
    out.push({
      id: `xid|${id}|${now}`,
      createdAt: now,
      level: 'error',
      kind: 'invalidId',
      conflictKey: `xid|${id}`,
      titleKey: 'notifications.invalidIdTitle',
      bodyKey: 'notifications.invalidIdBody',
      params: { id },
      aId: id,
      read: false,
    });
  }

  if (flagConflicts) {
    for (const msg of flagConflicts.hardErrors) {
      out.push({
        id: `he|${msg}|${now}`,
        createdAt: now,
        level: 'error',
        kind: 'cycle',
        conflictKey: `he|${msg}`,
        titleKey: 'notifications.cycleTitle',
        bodyKey: 'notifications.cycleBody',
        params: { msg },
        read: false,
      });
    }
  }

  if (options.includeManual) {
    for (const id of findIncompleteManualRegions(scheme)) {
      out.push({
        id: `im|${id}|${now}`,
        createdAt: now,
        level: 'error',
        kind: 'incompleteManual',
        conflictKey: `im|${id}`,
        titleKey: 'notifications.incompleteManualTitle',
        bodyKey: 'notifications.incompleteManualBody',
        params: { id },
        aId: id,
        read: false,
      });
    }
  }

  return out;
}
