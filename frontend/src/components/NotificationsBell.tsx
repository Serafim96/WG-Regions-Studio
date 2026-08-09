import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { IconBell, IconRefresh } from './GraphControlIcons';

export type NotificationLevel = 'error' | 'warning';
export type NotificationKind = 'spatial' | 'overwrite' | 'orphan' | 'height' | 'info' | 'update';

export interface AppNotification {
  id: string;
  createdAt: number;
  level: NotificationLevel;
  kind: NotificationKind;
  /** Stable key used to dedupe and auto-remove when the conflict is gone. */
  conflictKey: string;
  /** i18n key for title — translated at render so locale switches apply. */
  titleKey: TranslationKey;
  /** i18n key for body. */
  bodyKey: TranslationKey;
  params?: Record<string, string | number>;
  /** Extra plain-text line (e.g. release highlights), not i18n. */
  detail?: string;
  flagName?: string;
  /** Spatial: region A; overwrite: parent; orphan/height: region id. */
  aId?: string;
  /** Spatial: region B; overwrite: child. */
  bId?: string;
  relation?: 'intersects' | 'contains';
  /** External link (e.g. GitHub release) opened on click. */
  url?: string;
  read: boolean;
}

function selectionHasText(): boolean {
  const sel = window.getSelection();
  return Boolean(sel && sel.toString().trim().length > 0);
}

interface Props {
  open: boolean;
  notifications: AppNotification[];
  onToggle: () => void;
  onClose: () => void;
  onRefresh: () => void;
  onMarkAllRead: () => void;
  onClear: () => void;
  onDismiss: (id: string) => void;
  onOpenItem: (n: AppNotification) => void;
}

export function NotificationsBell({
  open,
  notifications,
  onToggle,
  onClose,
  onRefresh,
  onMarkAllRead,
  onClear,
  onDismiss,
  onOpenItem,
}: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<NotificationLevel>('error');

  const errors = notifications.filter((n) => n.level === 'error');
  const warnings = notifications.filter((n) => n.level === 'warning');
  const unreadErrors = errors.filter((n) => !n.read).length;
  const unreadWarnings = warnings.filter((n) => !n.read).length;
  const unreadTotal = unreadErrors + unreadWarnings;
  const activeList = tab === 'error' ? errors : warnings;

  const badgeClass = unreadErrors > 0
    ? 'notifications-badge notifications-badge--error'
    : 'notifications-badge notifications-badge--warning';
  const badgeCount = unreadErrors > 0 ? unreadErrors : unreadWarnings;

  return (
    <div className="notifications-root">
      <button
        type="button"
        className="graph-ctrl-btn"
        title={t('notifications.title')}
        onClick={onToggle}
      >
        <IconBell />
        {unreadTotal > 0 && (
          <span className={badgeClass}>{badgeCount > 9 ? '9+' : badgeCount}</span>
        )}
      </button>
      {open && (
        <div className="notifications-panel" role="dialog" aria-label={t('notifications.title')}>
          <header>
            <div className="notifications-header-title">
              <h3>{t('notifications.title')}</h3>
              <button
                type="button"
                className="notifications-refresh"
                onClick={onRefresh}
                title={t('notifications.refresh')}
                aria-label={t('notifications.refresh')}
              >
                <IconRefresh size={16} />
              </button>
            </div>
            <button type="button" className="notifications-close" onClick={onClose}>×</button>
          </header>
          <div className="notifications-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'error'}
              className={tab === 'error' ? 'active' : ''}
              onClick={() => setTab('error')}
            >
              {t('notifications.tabErrors')}
              {unreadErrors > 0 ? ` (${unreadErrors})` : errors.length > 0 ? ` (${errors.length})` : ''}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'warning'}
              className={tab === 'warning' ? 'active' : ''}
              onClick={() => setTab('warning')}
            >
              {t('notifications.tabWarnings')}
              {unreadWarnings > 0 ? ` (${unreadWarnings})` : warnings.length > 0 ? ` (${warnings.length})` : ''}
            </button>
          </div>
          <div className="notifications-actions">
            <button
              type="button"
              className="notifications-action-btn"
              onClick={onMarkAllRead}
              disabled={unreadTotal === 0}
            >
              {t('notifications.markRead')}
            </button>
            {tab === 'warning' && (
              <button
                type="button"
                className="notifications-action-btn"
                onClick={onClear}
                disabled={warnings.length === 0}
              >
                {t('notifications.clear')}
              </button>
            )}
          </div>
          {activeList.length === 0 ? (
            <p className="notifications-empty">
              {tab === 'error' ? t('notifications.emptyErrors') : t('notifications.emptyWarnings')}
            </p>
          ) : (
            <ul className="notifications-list">
              {activeList.map((n) => (
                <li
                  key={n.id}
                  className={`${n.read ? 'read' : 'unread'} notifications-item--${n.level}`}
                >
                  <div
                    className="notifications-item-body"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (selectionHasText()) return;
                      onOpenItem(n);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenItem(n);
                      }
                    }}
                  >
                    <strong>{t(n.titleKey, n.params)}</strong>
                    <span>{t(n.bodyKey, n.params)}</span>
                    {n.detail ? (
                      <span className="notifications-item-detail">{n.detail}</span>
                    ) : null}
                  </div>
                  {n.level === 'warning' && (
                    <button
                      type="button"
                      className="notifications-item-dismiss"
                      title={t('notifications.dismissOne')}
                      aria-label={t('notifications.dismissOne')}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDismiss(n.id);
                      }}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
