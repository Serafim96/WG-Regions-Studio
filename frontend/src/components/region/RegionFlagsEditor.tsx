import { useI18n } from '../../i18n/I18nContext';
import type { FlagInfo } from '../../types';
import type { FlagRow } from '../../hooks/useRegionDraftState';
import { findFlagInfo, FlagNameWithHelp } from '../FlagHelpButton';
import { FlagNameCombobox } from '../FlagNameCombobox';
import { FlagValueInput } from '../FlagValueInput';

export type RegionFlagsEditorProps = {
  fieldsLocked: boolean;
  fieldsEditable: boolean;
  flagRows: FlagRow[];
  flagsError: string | null;
  flagsCatalog: FlagInfo[];
  flagsByName: Map<string, FlagInfo>;
  isDirty: boolean;
  canEdit: boolean;
  onUpdateFlagRow: (key: string, patch: Partial<Pick<FlagRow, 'name' | 'value'>>) => void;
  onRemoveFlagRow: (key: string) => void;
  onAddFlagRow: () => void;
  onRequestClearFlags: () => void;
  onShowFlagOnScheme?: (flagName: string) => void;
};

export function RegionFlagsEditor({
  fieldsLocked,
  fieldsEditable,
  flagRows,
  flagsError,
  flagsCatalog,
  flagsByName,
  isDirty,
  canEdit,
  onUpdateFlagRow,
  onRemoveFlagRow,
  onAddFlagRow,
  onRequestClearFlags,
  onShowFlagOnScheme,
}: RegionFlagsEditorProps) {
  const { t } = useI18n();

  return (
    <div className="flags-table-wrap">
      <p><strong>{t('region.flags')}</strong></p>
      {canEdit && !fieldsLocked ? (
        <>
          <table className="flags-table flags-edit-table">
            <thead>
              <tr>
                <th>{t('region.flagName')}</th>
                <th>{t('region.flagValue')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {flagRows.map((row) => {
                const info = findFlagInfo(flagsCatalog, row.name);
                return (
                  <tr key={row.key}>
                    <td>
                      <FlagNameCombobox
                        value={row.name}
                        flagsCatalog={flagsCatalog}
                        onChange={(name) => onUpdateFlagRow(row.key, { name })}
                        placeholder={t('flagsManager.namePlaceholder')}
                        onShowOnScheme={onShowFlagOnScheme}
                        unsavedChanges={isDirty}
                      />
                    </td>
                    <td>
                      <FlagValueInput
                        value={row.value}
                        flagType={info?.type}
                        onChange={(value) => onUpdateFlagRow(row.key, { value })}
                        placeholder={t('flagsManager.valuePlaceholder')}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="flags-row-remove"
                        disabled={!fieldsEditable}
                        onClick={() => onRemoveFlagRow(row.key)}
                        title={t('flagsManager.remove')}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {flagRows.length === 0 && <p>{t('region.noFlags')}</p>}
          {flagsError && <p className="flags-manager-error">{flagsError}</p>}
          <div className="modal-actions">
            <button type="button" disabled={!fieldsEditable} onClick={onAddFlagRow}>
              {t('flagsManager.add')}
            </button>
            <button
              type="button"
              className="warning"
              disabled={!fieldsEditable || flagRows.length === 0}
              onClick={onRequestClearFlags}
            >
              {t('region.clearFlags')}
            </button>
          </div>
        </>
      ) : flagRows.length === 0 ? (
        <p>{t('region.noFlags')}</p>
      ) : (
        <table className="flags-table">
          <thead>
            <tr>
              <th>{t('region.flagName')}</th>
              <th>{t('region.flagValue')}</th>
              <th>{t('region.flagType')}</th>
            </tr>
          </thead>
          <tbody>
            {flagRows.map((row) => {
              const info = flagsByName.get(row.name);
              return (
                <tr key={row.key}>
                  <td>
                    {row.name.trim() ? (
                      <FlagNameWithHelp
                        name={row.name}
                        flagsCatalog={flagsCatalog}
                        unsavedChanges={isDirty}
                        onShowOnScheme={onShowFlagOnScheme}
                      />
                    ) : (
                      row.name
                    )}
                  </td>
                  <td>{row.value}</td>
                  <td>{info?.type ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {fieldsLocked && flagsError && <p className="flags-manager-error">{flagsError}</p>}
    </div>
  );
}
