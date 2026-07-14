import { useI18n } from '../i18n/I18nContext';

export type DeleteChildrenMode = 'detach' | 'cascade';

interface DeleteManualRegionDialogProps {
  regionId: string;
  childIds: string[];
  onConfirm: (mode: DeleteChildrenMode) => void;
  onClose: () => void;
}

export function DeleteManualRegionDialog({
  regionId,
  childIds,
  onConfirm,
  onClose,
}: DeleteManualRegionDialogProps) {
  const { t } = useI18n();
  const hasChildren = childIds.length > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal delete-manual-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('deleteManual.title')}</h2>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="modal-body">
          {hasChildren ? (
            <>
              <p>{t('deleteManual.withChildren', { id: regionId, count: childIds.length })}</p>
              <ul className="delete-manual-children">
                {childIds.slice(0, 8).map((childId) => (
                  <li key={childId}>{childId}</li>
                ))}
                {childIds.length > 8 && (
                  <li>{t('deleteManual.andMore', { count: childIds.length - 8 })}</li>
                )}
              </ul>
              <div className="modal-actions delete-manual-actions">
                <button type="button" className="danger" onClick={() => onConfirm('cascade')}>
                  {t('deleteManual.cascade')}
                </button>
                <button type="button" onClick={() => onConfirm('detach')}>
                  {t('deleteManual.detach')}
                </button>
                <button type="button" onClick={onClose}>{t('deleteManual.cancel')}</button>
              </div>
            </>
          ) : (
            <>
              <p>{t('deleteManual.confirm', { id: regionId })}</p>
              <div className="modal-actions delete-manual-actions">
                <button type="button" className="danger" onClick={() => onConfirm('detach')}>
                  {t('deleteManual.delete')}
                </button>
                <button type="button" onClick={onClose}>{t('deleteManual.cancel')}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
