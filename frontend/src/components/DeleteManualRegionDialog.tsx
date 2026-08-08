import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/I18nContext';
import { ModalOverlay } from './ModalOverlay';

export type DeleteChildrenMode = 'detach' | 'cascade' | 'orphan';

interface DeleteManualRegionDialogProps {
  regionId: string;
  childIds: string[];
  /** Parent of the region being deleted (null/undefined = root). */
  parentId?: string | null;
  onConfirm: (mode: DeleteChildrenMode) => void;
  onClose: () => void;
}

export function DeleteManualRegionDialog({
  regionId,
  childIds,
  parentId = null,
  onConfirm,
  onClose,
}: DeleteManualRegionDialogProps) {
  const { t } = useI18n();
  const hasChildren = childIds.length > 0;
  const hasParent = Boolean(parentId);

  return createPortal(
    <ModalOverlay className="confirm-dialog-overlay" onClose={onClose}>
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
              {!hasParent && (
                <p className="delete-manual-warn">{t('deleteManual.noParentWarn')}</p>
              )}
              {hasParent && (
                <p className="hint">{t('deleteManual.parentHint', { parent: parentId! })}</p>
              )}
              <div className="modal-actions delete-manual-actions">
                <button type="button" className="danger" onClick={() => onConfirm('cascade')}>
                  {t('deleteManual.cascade')}
                </button>
                {hasParent && (
                  <button type="button" className="danger" onClick={() => onConfirm('detach')}>
                    {t('deleteManual.reparent', { parent: parentId! })}
                  </button>
                )}
                <button type="button" className="danger" onClick={() => onConfirm('orphan')}>
                  {t('deleteManual.orphan')}
                </button>
                <button type="button" className="primary" onClick={onClose}>
                  {t('deleteManual.cancel')}
                </button>
              </div>
            </>
          ) : (
            <>
              <p>{t('deleteManual.confirm', { id: regionId })}</p>
              <div className="modal-actions delete-manual-actions">
                <button type="button" className="danger" onClick={() => onConfirm('detach')}>
                  {t('deleteManual.delete')}
                </button>
                <button type="button" className="primary" onClick={onClose}>
                  {t('deleteManual.cancel')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </ModalOverlay>,
    document.body,
  );
}
