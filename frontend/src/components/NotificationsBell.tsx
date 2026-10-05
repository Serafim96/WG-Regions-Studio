import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { IconBell, IconRefresh } from './GraphControlIcons';

export type NotificationLevel = 'error' | 'warning';
export type NotificationKind =
  | 'spatial'
  | 'overwrite'
  | 'orphan'
  | 'height'
  | 'info'
  | 'update'
  | 'invalidId'
  | 'cycle'
  | 'incompleteManual';

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

function typeKey(n: Pick<AppNotification, 'level' | 'kind'>): string {
  return `${n.level}:${n.kind}`;
}

const TYPE_LABEL: Record<string, TranslationKey> = {
  'error:spatial': 'notifications.type.spatialError',
  'warning:spatial': 'notifications.type.spatialWarning',
  'warning:overwrite': 'notifications.type.overwrite',
  'warning:orphan': 'notifications.type.orphan',
  'warning:height': 'notifications.type.height',
  'error:invalidId': 'notifications.type.invalidId',
  'error:cycle': 'notifications.type.cycle',
  'error:incompleteManual': 'notifications.type.incompleteManual',
  'warning:update': 'notifications.type.update',
  'warning:info': 'notifications.type.info',
  'error:info': 'notifications.type.info',
};

const ERROR_TYPE_KEYS = [
  'error:spatial',
  'error:invalidId',
  'error:cycle',
  'error:incompleteManual',
] as const;

const WARNING_TYPE_KEYS = [
  'warning:spatial',
  'warning:overwrite',
  'warning:orphan',
  'warning:height',
] as const;

interface Props {
  open: boolean;
  notifications: AppNotification[];
  onToggle: () => void;
  onClose: () => void;
  onRefresh: () => void;
  onMarkAllRead: (ids: string[]) => void;
  onClear: (ids: string[]) => void;
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
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(() => new Set());

  const shown = (n: AppNotification) => !hiddenTypes.has(typeKey(n));
  const errorsAll = notifications.filter((n) => n.level === 'error');
  const warningsAll = notifications.filter((n) => n.level === 'warning');
  const errors = errorsAll.filter(shown);
  const warnings = warningsAll.filter(shown);
  const unreadErrors = errors.filter((n) => !n.read).length;
  const unreadWarnings = warnings.filter((n) => !n.read).length;
  const unreadOnTab = tab === 'error' ? unreadErrors : unreadWarnings;
  const activeList = tab === 'error' ? errors : warnings;
  const activeAll = tab === 'error' ? errorsAll : warningsAll;
  const hasErrors = errors.length > 0;

  const typeCounts = new Map<string, number>();
  for (const n of activeAll) {
    const key = typeKey(n);
    typeCounts.set(key, (typeCounts.get(key) ?? 0) + 1);
  }
  const catalog: readonly string[] = tab === 'error' ? ERROR_TYPE_KEYS : WARNING_TYPE_KEYS;
  const typeRows = [
    ...catalog,
    ...[...typeCounts.keys()].filter((key) => !catalog.includes(key) && key.startsWith(`${tab}:`)),
  ];

  const toggleType = (key: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const btnClass = hasErrors
    ? 'graph-ctrl-btn graph-ctrl-btn--error-active'
    : 'graph-ctrl-btn';
  const badgeClass = hasErrors
    ? 'notifications-badge notifications-badge--on-error-btn'
    : 'notifications-badge notifications-badge--warning';
  const showBadge = hasErrors || unreadWarnings > 0;
  const badgeCount = hasErrors ? errors.length : unreadWarnings;

  return (
    <div className="notifications-root">
      <button
        type="button"
        className={btnClass}
        title={t('notifications.title')}
        onClick={onToggle}
      >
        <IconBell />
        {showBadge && (
          <span className={badgeClass}>{badgeCount > 9 ? '9+' : badgeCount}</span>
        )}
      </button>
      {open && (
        <div className="notifications-panel" role="dialog" aria-label={t('notifications.title')}>
          <div className="notifications-panel-top">
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
              onClick={() => onMarkAllRead(activeList.map((n) => n.id))}
              disabled={unreadOnTab === 0}
            >
              {t('notifications.markRead')}
            </button>
            {tab === 'warning' && (
              <button
                type="button"
                className="notifications-action-btn"
                onClick={() => onClear(activeList.map((n) => n.id))}
                disabled={warnings.length === 0}
              >
                {t('notifications.clear')}
              </button>
            )}
          </div>
          {typeRows.length > 0 && (
            <div className="notifications-type-filters">
              {typeRows.map((key) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={!hiddenTypes.has(key)}
                    onChange={() => toggleType(key)}
                  />
                  <span>
                    {TYPE_LABEL[key] ? t(TYPE_LABEL[key]) : key}
                    {` (${typeCounts.get(key) ?? 0})`}
                  </span>
                </label>
              ))}
            </div>
          )}
          </div>
          <div className="notifications-panel-list">
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
        </div>
      )}
    </div>
  );
}
