import { useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import type { RegionData } from '../../types';
import { IconAdd, IconMinus, IconTrash } from '../GraphControlIcons';

export type StringListEditorProps = {
  label: string;
  values: string[];
  disabled?: boolean;
  readOnly?: boolean;
  onChange: (next: string[]) => void;
  onRequestClearAll: (onConfirm: () => void) => void;
};

/** Shared string-list editor used by owners/members (kept with members for reuse). */
export function StringListEditor({
  label,
  values,
  disabled,
  readOnly,
  onChange,
  onRequestClearAll,
}: StringListEditorProps) {
  const { t } = useI18n();
  const [checked, setChecked] = useState<Set<number>>(() => new Set());
  const editing = !readOnly;

  const shown = useMemo(
    () => (readOnly ? values.map((v) => v.trim()).filter(Boolean) : values),
    [readOnly, values],
  );

  const toggleRow = (index: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const clearChecked = () => {
    if (checked.size === 0) return;
    const next = values.filter((_, i) => !checked.has(i));
    onChange(next);
    setChecked(new Set());
  };

  const requestClearAll = () => {
    if (values.length === 0) return;
    onRequestClearAll(() => {
      onChange([]);
      setChecked(new Set());
    });
  };

  const requestRemoveCheckedOrAll = () => {
    if (checked.size > 0) {
      clearChecked();
      return;
    }
    requestClearAll();
  };

  return (
    <div className="region-members-subtable">
      <div className="region-members-subhead">
        <p className="region-members-sublabel">{label}</p>
        <div className={`region-members-toolbar${editing ? '' : ' region-flow-hidden'}`} aria-hidden={!editing}>
          <button
            type="button"
            className="icon-btn"
            disabled={disabled}
            title={t('region.stringListAdd')}
            aria-label={t('region.stringListAdd')}
            onClick={() => onChange([...values, ''])}
          >
            <IconAdd size={20} />
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled={disabled || values.length === 0}
            title={t('region.stringListRemove')}
            aria-label={t('region.stringListRemove')}
            onClick={requestRemoveCheckedOrAll}
          >
            <IconMinus size={20} />
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled={disabled || values.length === 0}
            title={t('region.stringListClearAll')}
            aria-label={t('region.stringListClearAll')}
            onClick={requestClearAll}
          >
            <IconTrash size={20} />
          </button>
        </div>
      </div>
      <div className="region-link-table region-link-table--full">
        <table className="flags-table region-effective-table region-members-table">
          <thead>
            <tr>
              <th className="region-members-check-col" aria-hidden={!editing} />
              <th>{label}</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && readOnly ? (
              <tr>
                <td className="region-members-check-col" />
                <td>{t('region.tableEmpty')}</td>
              </tr>
            ) : values.length === 0 && editing ? (
              <tr>
                <td className="region-members-check-col" />
                <td>{t('region.tableEmpty')}</td>
              </tr>
            ) : readOnly ? (
              shown.map((value, index) => (
                <tr key={`${value}-${index}`}>
                  <td className="region-members-check-col" />
                  <td className="region-cell-readonly">{value}</td>
                </tr>
              ))
            ) : (
              values.map((value, index) => (
                <tr key={`edit-${index}`}>
                  <td className="region-members-check-col">
                    <input
                      type="checkbox"
                      checked={checked.has(index)}
                      disabled={disabled}
                      onChange={() => toggleRow(index)}
                      aria-label={t('region.stringListSelectRow')}
                    />
                  </td>
                  <td>
                    <input
                      className="search-input region-cell-input"
                      type="text"
                      value={value}
                      disabled={disabled}
                      onChange={(e) => {
                        const next = [...values];
                        next[index] = e.target.value;
                        onChange(next);
                      }}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export type RegionMembersEditorProps = {
  region: RegionData;
  fieldsLocked: boolean;
  fieldsEditable: boolean;
  canEdit: boolean;
  ownersPlayers: string[];
  ownersUniqueIds: string[];
  membersPlayers: string[];
  membersUniqueIds: string[];
  membersError: string | null;
  onOwnersPlayersChange: (next: string[]) => void;
  onOwnersUniqueIdsChange: (next: string[]) => void;
  onMembersPlayersChange: (next: string[]) => void;
  onMembersUniqueIdsChange: (next: string[]) => void;
  onRequestClearList: (onConfirm: () => void) => void;
};

export function RegionMembersEditor({
  region,
  fieldsLocked,
  fieldsEditable,
  canEdit,
  ownersPlayers,
  ownersUniqueIds,
  membersPlayers,
  membersUniqueIds,
  membersError,
  onOwnersPlayersChange,
  onOwnersUniqueIdsChange,
  onMembersPlayersChange,
  onMembersUniqueIdsChange,
  onRequestClearList,
}: RegionMembersEditorProps) {
  const { t } = useI18n();

  return (
    <div className="region-members-block">
      <p className="region-meta-label">{t('region.owners')}</p>
      {canEdit ? (
        <>
          <StringListEditor
            label={t('region.players')}
            values={ownersPlayers}
            disabled={!fieldsEditable}
            readOnly={fieldsLocked}
            onChange={onOwnersPlayersChange}
            onRequestClearAll={onRequestClearList}
          />
          <StringListEditor
            label={t('region.uniqueIds')}
            values={ownersUniqueIds}
            disabled={!fieldsEditable}
            readOnly={fieldsLocked}
            onChange={onOwnersUniqueIdsChange}
            onRequestClearAll={onRequestClearList}
          />
        </>
      ) : (
        <pre className="region-members-readonly">{JSON.stringify(region.owners ?? {}, null, 2)}</pre>
      )}

      <p className="region-meta-label">{t('region.members')}</p>
      {canEdit ? (
        <>
          <StringListEditor
            label={t('region.players')}
            values={membersPlayers}
            disabled={!fieldsEditable}
            readOnly={fieldsLocked}
            onChange={onMembersPlayersChange}
            onRequestClearAll={onRequestClearList}
          />
          <StringListEditor
            label={t('region.uniqueIds')}
            values={membersUniqueIds}
            disabled={!fieldsEditable}
            readOnly={fieldsLocked}
            onChange={onMembersUniqueIdsChange}
            onRequestClearAll={onRequestClearList}
          />
          {membersError && <p className="flags-manager-error">{membersError}</p>}
        </>
      ) : (
        <pre className="region-members-readonly">{JSON.stringify(region.members ?? {}, null, 2)}</pre>
      )}
    </div>
  );
}
