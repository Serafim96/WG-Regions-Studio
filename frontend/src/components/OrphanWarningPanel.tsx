import { useI18n } from '../i18n/I18nContext';

interface OrphanWarningPanelProps {
  orphanIds: string[];
  onClose: () => void;
}

export function OrphanWarningPanel({ orphanIds, onClose }: OrphanWarningPanelProps) {
  const { t } = useI18n();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal orphan-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('orphan.title')}</h2>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="modal-body">
          <p className="hash-warning">
            {t('orphan.message', { count: orphanIds.length })}
          </p>
          <ul className="orphan-list">
            {orphanIds.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
