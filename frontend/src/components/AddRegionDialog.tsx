import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { FlagInfo } from '../types';
import { compareNatural } from '../utils/naturalSort';
import { isValidRegionId } from '../utils/regionId';
import { validateFlagRows } from '../utils/flagRows';
import { findFlagInfo } from './FlagHelpButton';
import { FlagNameCombobox } from './FlagNameCombobox';
import { FlagValueInput } from './FlagValueInput';
import { ModalOverlay } from './ModalOverlay';
import { ConfirmDialog } from './ConfirmDialog';
import { SuggestDropdown } from './SuggestDropdown';
import {
  emptyGeometryState,
  RegionGeometryEditor,
  validateGeometryState,
  type GeometryPayload,
  type RegionGeometryState,
} from './RegionGeometryEditor';

interface FlagRow {
  key: string;
  name: string;
  value: string;
}

interface AddRegionDialogProps {
  regionIds: string[];
  flagsCatalog: FlagInfo[];
  /** Prefills parent; the field stays editable. */
  initialParent?: string;
  onAdd: (data: {
    id: string;
    parent: string | null;
    priority: number;
    flags: Record<string, string>;
    geometry: GeometryPayload;
  }) => void;
  onClose: () => void;
  /** Open flag highlight; always treated as unsaved until the region is created. */
  onShowFlagOnScheme?: (flagName: string) => void;
}

const INITIAL_GEOMETRY = emptyGeometryState('cuboid');

function resolveParentQuery(query: string, regionIds: string[]): string | null {
  const q = query.trim();
  if (!q) return null;
  return regionIds.find((id) => id.toLowerCase() === q.toLowerCase()) ?? null;
}

function rowsToFlags(rows: FlagRow[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) continue;
    flags[name] = row.value;
  }
  return flags;
}

export function AddRegionDialog({
  regionIds,
  flagsCatalog,
  initialParent,
  onAdd,
  onClose,
  onShowFlagOnScheme,
}: AddRegionDialogProps) {
  const { t } = useI18n();
  const [id, setId] = useState('');
  const [parentQuery, setParentQuery] = useState(initialParent ?? '');
  const [priority, setPriority] = useState(0);
  const [geometry, setGeometry] = useState<RegionGeometryState>(() => emptyGeometryState('cuboid'));
  const [flagRows, setFlagRows] = useState<FlagRow[]>([]);
  const [geometryError, setGeometryError] = useState<string | null>(null);
  const [flagsError, setFlagsError] = useState<string | null>(null);
  const [showParentSuggestions, setShowParentSuggestions] = useState(false);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  const parentMatches = useMemo(() => {
    const q = parentQuery.trim().toLowerCase();
    const sorted = [...regionIds].sort(compareNatural);
    if (!q) return sorted.slice(0, 80);
    return sorted
      .filter((regionId) => regionId.toLowerCase().includes(q))
      .slice(0, 50);
  }, [parentQuery, regionIds]);

  const resolvedParent = resolveParentQuery(parentQuery, regionIds);
  const parentInputInvalid = parentQuery.trim() !== '' && resolvedParent === null;

  const trimmedId = id.trim().toLowerCase();
  const idInvalid = trimmedId !== '' && !isValidRegionId(trimmedId);
  const idExists = trimmedId !== '' && regionIds.some((r) => r.toLowerCase() === trimmedId);
  const canSubmit = isValidRegionId(trimmedId) && !parentInputInvalid && !idExists;

  const initialParentTrimmed = (initialParent ?? '').trim();
  const isDirty =
    trimmedId !== '' ||
    parentQuery.trim() !== initialParentTrimmed ||
    priority !== 0 ||
    JSON.stringify(geometry) !== JSON.stringify(INITIAL_GEOMETRY) ||
    flagRows.some((row) => row.name.trim() !== '' || row.value.trim() !== '');

  const requestClose = () => {
    if (isDirty) {
      setShowUnsavedConfirm(true);
      return;
    }
    onClose();
  };

  const updateFlagRow = (key: string, patch: Partial<Pick<FlagRow, 'name' | 'value'>>) => {
    setFlagRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setFlagsError(null);
  };

  const removeFlagRow = (key: string) => {
    setFlagRows((prev) => prev.filter((row) => row.key !== key));
    setFlagsError(null);
  };

  const addFlagRow = () => {
    setFlagRows((prev) => [
      ...prev,
      { key: `new-${Date.now()}-${prev.length}`, name: '', value: '' },
    ]);
  };

  const pickParent = (regionId: string) => {
    setParentQuery(regionId);
    setShowParentSuggestions(false);
  };

  const handleParentChange = (value: string) => {
    setParentQuery(value);
    setShowParentSuggestions(true);
  };

  const submit = () => {
    if (!canSubmit) return;
    const geo = validateGeometryState(geometry);
    if (!geo.ok) {
      setGeometryError(t(geo.errorKey));
      return;
    }
    const flagCheck = validateFlagRows(flagRows, flagsCatalog);
    if (!flagCheck.ok) {
      setFlagsError(t(flagCheck.errorKey));
      return;
    }
    setGeometryError(null);
    setFlagsError(null);
    onAdd({
      id: trimmedId,
      parent: resolvedParent,
      priority,
      flags: rowsToFlags(flagRows),
      geometry: geo.payload,
    });
  };

  return (
    <>
    <ModalOverlay onClose={requestClose}>
      <div className="modal">
        <header>
          <h2>{initialParent ? t('addRegion.titleDescendant') : t('addRegion.title')}</h2>
          <button type="button" onClick={requestClose}>×</button>
        </header>
        <div className="modal-body form-grid">
          <label>
            ID
            <input
              value={id}
              onChange={(e) => setId(e.target.value.toLowerCase())}
              autoFocus
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          {idInvalid && <p className="form-field-error">{t('addRegion.idInvalid')}</p>}
          {idExists && <p className="form-field-error">{t('addRegion.idExists')}</p>}
          <label>
            {t('addRegion.parent')}
            <>
              <input
                className="search-input"
                type="text"
                placeholder={t('addRegion.parentPlaceholder')}
                value={parentQuery}
                onChange={(e) => handleParentChange(e.target.value)}
                onFocus={() => setShowParentSuggestions(true)}
                onBlur={() => {
                  window.setTimeout(() => setShowParentSuggestions(false), 150);
                }}
              />
              <SuggestDropdown
                items={parentMatches}
                query={parentQuery}
                open={showParentSuggestions}
                onPick={pickParent}
                emptyWhenQuery
              />
              {showParentSuggestions && parentInputInvalid && (
                <p className="search-empty">{t('addRegion.parentInvalid')}</p>
              )}
              {!parentQuery.trim() && (
                <p className="hint">{t('addRegion.rootOption')}</p>
              )}
            </>
          </label>
          <label>
            {t('addRegion.priority')}
            <input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
          </label>

          <RegionGeometryEditor value={geometry} onChange={(next) => {
            setGeometry(next);
            setGeometryError(null);
          }} />
          {geometryError && <p className="flags-manager-error">{geometryError}</p>}

          <div className="flags-table-wrap add-region-flags-wrap">
            <p><strong>{t('addRegion.flags')}</strong></p>
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
                          onChange={(name) => updateFlagRow(row.key, { name })}
                          placeholder={t('flagsManager.namePlaceholder')}
                          onShowOnScheme={onShowFlagOnScheme}
                          unsavedChanges
                        />
                      </td>
                      <td>
                        <FlagValueInput
                          value={row.value}
                          flagType={info?.type}
                          onChange={(value) => updateFlagRow(row.key, { value })}
                          placeholder={t('flagsManager.valuePlaceholder')}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="flags-row-remove"
                          onClick={() => removeFlagRow(row.key)}
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
              <button type="button" onClick={addFlagRow}>{t('flagsManager.add')}</button>
            </div>
          </div>

          <button type="button" className="success" onClick={submit} disabled={!canSubmit}>
            {t('addRegion.submit')}
          </button>
        </div>
      </div>
    </ModalOverlay>
      {showUnsavedConfirm && (
        <ConfirmDialog
          title={t('dialog.unsavedTitle')}
          message={t('dialog.unsavedConfirm')}
          onCancel={() => setShowUnsavedConfirm(false)}
          onConfirm={() => {
            setShowUnsavedConfirm(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
