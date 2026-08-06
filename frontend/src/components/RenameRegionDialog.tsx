import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { isValidRegionId } from '../utils/regionId';
import { ModalOverlay } from './ModalOverlay';

interface RenameRegionDialogProps {
  regionId: string;
  onRename: (regionId: string, newId: string) => Promise<void>;
  onClose: () => void;
}

export function RenameRegionDialog({ regionId, onRename, onClose }: RenameRegionDialogProps) {
  const { t } = useI18n();
  const [newId, setNewId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = newId.trim().toLowerCase();
  const invalid = trimmed !== '' && !isValidRegionId(trimmed);
  const canSubmit = isValidRegionId(trimmed) && trimmed !== regionId.toLowerCase() && !busy;

  const copyOld = () => {
    setNewId(regionId);
    setError(null);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await onRename(regionId, trimmed);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal rename-region-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('region.editName')}</h2>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="modal-body form-grid">
          <label>
            {t('region.oldName')}
            <div className="rename-old-row">
              <input value={regionId} readOnly className="readonly-input" />
              <button type="button" onClick={copyOld} title={t('region.copyName')}>
                {t('region.copyToNew')}
              </button>
            </div>
          </label>
          <label>
            {t('region.newName')}
            <input
              className="search-input"
              type="text"
              value={newId}
              autoFocus
              disabled={busy}
              onChange={(e) => {
                setNewId(e.target.value.toLowerCase());
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
              }}
            />
          </label>
          {(invalid || error) && (
            <p className="flags-manager-error">{error ?? t('addRegion.idInvalid')}</p>
          )}
          <div className="modal-actions">
            <button type="button" className="success" disabled={!canSubmit} onClick={() => void submit()}>
              {t('region.saveName')}
            </button>
            <button type="button" disabled={busy} onClick={onClose}>
              {t('region.cancelName')}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
