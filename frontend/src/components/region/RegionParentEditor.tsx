import { useI18n } from '../../i18n/I18nContext';
import { SuggestDropdown } from '../SuggestDropdown';

export type RegionParentEditorProps = {
  fieldsLocked: boolean;
  fieldsEditable: boolean;
  editingParent: boolean;
  parentQuery: string;
  parentError: string | null;
  parentCandidates: string[];
  resolvedParent: string | undefined | null;
  lockedParentLabel: string | null;
  lockedParentNavId: string | null;
  canEditParent: boolean;
  currentParent: string | null;
  onBeginEdit: () => void;
  onNavigate: (id: string) => void;
  onParentQueryChange: (value: string) => void;
  onClearParent: () => void;
};

export function RegionParentEditor({
  fieldsLocked,
  fieldsEditable,
  editingParent,
  parentQuery,
  parentError,
  parentCandidates,
  resolvedParent,
  lockedParentLabel,
  lockedParentNavId,
  canEditParent,
  onBeginEdit,
  onNavigate,
  onParentQueryChange,
  onClearParent,
}: RegionParentEditorProps) {
  const { t } = useI18n();

  return (
    <div className="region-parent-block">
      {fieldsLocked || !canEditParent || !editingParent ? (
        <p>
          <strong>{t('region.parent')}:</strong>{' '}
          {lockedParentLabel == null ? (
            '—'
          ) : lockedParentNavId ? (
            <button
              type="button"
              className="region-link"
              onClick={() => onNavigate(lockedParentNavId)}
            >
              {lockedParentLabel}
            </button>
          ) : (
            <span>{lockedParentLabel}</span>
          )}
          {!fieldsLocked && canEditParent && (
            <button
              type="button"
              className="region-action-btn"
              disabled={!fieldsEditable}
              onClick={onBeginEdit}
            >
              {t('region.editParent')}
            </button>
          )}
        </p>
      ) : (
        <div className="region-parent-edit">
          <p><strong>{t('region.parent')}:</strong></p>
          <input
            className="search-input"
            type="text"
            placeholder={t('region.parentPlaceholder')}
            value={parentQuery}
            onChange={(e) => onParentQueryChange(e.target.value)}
            disabled={!fieldsEditable}
          />
          {parentQuery.trim() && resolvedParent === undefined && (
            <p className="search-empty">{t('region.parentInvalid')}</p>
          )}
          <SuggestDropdown
            items={parentCandidates}
            query={parentQuery}
            open={fieldsEditable && parentCandidates.length > 0}
            onPick={onParentQueryChange}
          />
          <div className="modal-actions">
            <button
              type="button"
              disabled={!fieldsEditable || !parentQuery.trim()}
              onClick={onClearParent}
            >
              {t('region.clearParent')}
            </button>
          </div>
        </div>
      )}
      {parentError && <p className="flags-manager-error">{parentError}</p>}
    </div>
  );
}
