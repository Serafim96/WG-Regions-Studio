import type { AppNotification } from '../components/NotificationsBell';
import { dismissUpdateTag } from '../utils/updateDismiss';

/** Legacy keys — cleared on startup; notifications are session-only. */
export const NOTIFICATIONS_STORAGE_KEYS = [
  'mrv.notifications.v3',
  'mrv.notifications.v2',
  'mrv.notifications.v1',
];

export function clearPersistedNotifications() {
  try {
    for (const key of NOTIFICATIONS_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

/** Update notices are app-level — keep them when the scheme list is rebuilt. */
export function keepUpdateNotifications(list: AppNotification[]): AppNotification[] {
  return list.filter((n) => n.kind === 'update');
}

const MAX_VISIBLE_TOASTS = 5;

/** Keep at most five conflict toasts on screen. */
export function trimNotificationToasts(toasts: AppNotification[]): AppNotification[] {
  return toasts.slice(0, MAX_VISIBLE_TOASTS);
}

/** Stable key for toast dedupe — spatial amb/res transitions share one toast. */
export function notificationToastDedupeKey(
  n: Pick<AppNotification, 'kind' | 'conflictKey' | 'flagName' | 'aId' | 'bId' | 'relation'>,
): string {
  if (n.kind === 'spatial' && n.flagName && n.aId && n.bId && n.relation) {
    return `sp|${n.flagName}|${n.aId}|${n.bId}|${n.relation}`;
  }
  return n.conflictKey;
}

export function rememberDismissedUpdate(n: AppNotification) {
  if (n.kind !== 'update') return;
  const latest = n.params?.latest;
  if (latest != null) dismissUpdateTag(String(latest));
}

/** Keep read/unread when rebuilding notifications for the same conflictKey. */
export function preserveNotificationReadState(
  prev: AppNotification[],
  next: AppNotification[],
): AppNotification[] {
  const readByKey = new Map<string, boolean>();
  for (const n of prev) {
    if (n.conflictKey) readByKey.set(n.conflictKey, n.read);
  }
  return next.map((n) => ({
    ...n,
    read: readByKey.get(n.conflictKey) ?? n.read,
  }));
}
