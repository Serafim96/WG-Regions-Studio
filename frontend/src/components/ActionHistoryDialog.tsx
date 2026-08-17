import { useI18n } from '../i18n/I18nContext';
import type { SchemeHistoryEntry } from '../hooks/useSchemeHistory';
import { ModalOverlay } from './ModalOverlay';

interface Props {
  entries: readonly SchemeHistoryEntry[];
  currentIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}

export function ActionHistoryDialog({
  entries,
  currentIndex,
  onSelect,
  onClose,
}: Props) {
  const { t } = useI18n();

  return (
    <ModalOverlay className="action-history-overlay" onClose={onClose}>
      <div className="modal action-history-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('history.title')}</h2>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="modal-body action-history-body">
          {entries.length === 0 ? (
            <p className="action-history-empty">{t('history.empty')}</p>
          ) : (
            <ol className="action-history-list">
              {entries.map((entry, index) => {
                const isCurrent = index === currentIndex;
                return (
                  <li key={entry.id} className={isCurrent ? 'is-current' : undefined}>
                    <button
                      type="button"
                      className={`action-history-item${isCurrent ? ' is-current' : ''}`}
                      onClick={() => onSelect(index)}
                      aria-current={isCurrent ? 'step' : undefined}
                    >
                      <span className="action-history-item-label">
                        {t(entry.labelKey as never, entry.labelParams as never)}
                      </span>
                      {isCurrent && (
                        <span className="action-history-item-marker">{t('history.current')}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
