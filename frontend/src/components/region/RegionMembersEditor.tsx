import { useI18n } from '../../i18n/I18nContext';
import type { RegionData } from '../../types';

export type StringListEditorProps = {
  label: string;
  values: string[];
  disabled?: boolean;
  readOnly?: boolean;
  addLabel: string;
  onChange: (next: string[]) => void;
};

/** Shared string-list editor used by owners/members (kept with members for reuse). */
export function StringListEditor({
  label,
  values,
  disabled,
  readOnly,
  addLabel,
  onChange,
}: StringListEditorProps) {
  if (readOnly) {
    const shown = values.map((v) => v.trim()).filter(Boolean);
    return (
      <div className="region-members-subtable">
        <p className="region-members-sublabel">{label}</p>
        {shown.length === 0 ? (
          <p className="partners-empty">—</p>
        ) : (
          <div className="region-link-table">
            <table>
              <tbody>
                {shown.map((value, index) => (
                  <tr key={`${value}-${index}`}>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="region-members-subtable">
      <p className="region-members-sublabel">{label}</p>
      <div className="region-link-table">
        <table>
          <tbody>
            {values.map((value, index) => (
              <tr key={`edit-${index}`}>
                <td>
                  <input
                    className="search-input"
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
                <td className="region-members-actions">
                  <button
                    type="button"
                    className="flags-row-remove"
                    disabled={disabled}
                    onClick={() => onChange(values.filter((_, i) => i !== index))}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="modal-actions">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([...values, ''])}
        >
          {addLabel}
        </button>
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
            addLabel={`+ ${t('region.players')}`}
            onChange={onOwnersPlayersChange}
          />
          <StringListEditor
            label={t('region.uniqueIds')}
            values={ownersUniqueIds}
            disabled={!fieldsEditable}
            readOnly={fieldsLocked}
            addLabel={`+ ${t('region.uniqueIds')}`}
            onChange={onOwnersUniqueIdsChange}
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
            addLabel={`+ ${t('region.players')}`}
            onChange={onMembersPlayersChange}
          />
          <StringListEditor
            label={t('region.uniqueIds')}
            values={membersUniqueIds}
            disabled={!fieldsEditable}
            readOnly={fieldsLocked}
            addLabel={`+ ${t('region.uniqueIds')}`}
            onChange={onMembersUniqueIdsChange}
          />
          {membersError && <p className="flags-manager-error">{membersError}</p>}
        </>
      ) : (
        <pre className="region-members-readonly">{JSON.stringify(region.members ?? {}, null, 2)}</pre>
      )}
    </div>
  );
}
