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

export function rememberDismissedUpdate(n: AppNotification) {
  if (n.kind !== 'update') return;
  const latest = n.params?.latest;
  if (latest != null) dismissUpdateTag(String(latest));
}
