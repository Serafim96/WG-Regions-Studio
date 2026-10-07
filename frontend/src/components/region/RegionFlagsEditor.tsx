import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import type { FlagInfo } from '../../types';
import type { FlagRow } from '../../hooks/useRegionDraftState';
import type { RegionData } from '../../types';
import { findFlagInfo, FlagNameWithHelp } from '../FlagHelpButton';
import { FlagNameCombobox } from '../FlagNameCombobox';
import { FlagValueInput } from '../FlagValueInput';
import { RegionPanelTableSection } from './RegionPanelTableSection';
import { RegionSortButton } from './RegionSortButton';
import { matchesTableSearch } from '../../utils/tableSearch';
import { compareNatural } from '../../utils/naturalSort';
import { conflictsForDefinedFlag } from '../../utils/flagConflictLookup';
import type { SpatialConflict } from '../../utils/flagConflicts';
import { ConflictBadge } from './ConflictBadge';

export type RegionFlagsEditorProps = {
  regionId: string;
  fieldsLocked: boolean;
  fieldsEditable: boolean;
  flagRows: FlagRow[];
  flagsError: string | null;
  flagsCatalog: FlagInfo[];
  flagsByName: Map<string, FlagInfo>;
  regionsById: Map<string, RegionData>;
  spatialConflicts: SpatialConflict[];
  isDirty: boolean;
  canEdit: boolean;
  onUpdateFlagRow: (key: string, patch: Partial<Pick<FlagRow, 'name' | 'value'>>) => void;
  onRemoveFlagRow: (key: string) => void;
  onAddFlagRow: () => void;
  onRequestClearFlags: () => void;
  onShowFlagOnScheme?: (flagName: string) => void;
  onShowConflictOnScheme: (c: SpatialConflict) => void;
};

type SortKey = 'name' | 'value' | 'type';
type SortDir = 'asc' | 'desc';

type ColumnFilters = { name: string; value: string; type: string };

function rowPassesFilters(
  row: FlagRow,
  filters: ColumnFilters,
  flagsByName: Map<string, FlagInfo>,
): boolean {
  if (!row.name.trim()) return true;
  const type = flagsByName.get(row.name)?.type ?? '';
  if (!matchesTableSearch(row.name, filters.name)) return false;
  if (!matchesTableSearch(String(row.value ?? ''), filters.value)) return false;
  if (!matchesTableSearch(type, filters.type)) return false;
  return true;
}

function sortRows(
  rows: FlagRow[],
  sortKey: SortKey,
  sortDir: SortDir,
  flagsByName: Map<string, FlagInfo>,
): FlagRow[] {
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aEmpty = !a.name.trim();
    const bEmpty = !b.name.trim();
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
    const cmp = (x: string, y: string) => compareNatural(x, y) * dir;
    switch (sortKey) {
      case 'name':
        return cmp(a.name, b.name);
      case 'value':
        return cmp(String(a.value ?? ''), String(b.value ?? ''));
      case 'type':
        return cmp(flagsByName.get(a.name)?.type ?? '', flagsByName.get(b.name)?.type ?? '');
      default:
        return 0;
    }
  });
}

export function RegionFlagsEditor({
  regionId,
  fieldsLocked,
  fieldsEditable,
  flagRows,
  flagsError,
  flagsCatalog,
  flagsByName,
  regionsById,
  spatialConflicts,
  isDirty,
  canEdit,
  onUpdateFlagRow,
  onRemoveFlagRow,
  onAddFlagRow,
  onRequestClearFlags,
  onShowFlagOnScheme,
  onShowConflictOnScheme,
}: RegionFlagsEditorProps) {
  const { t } = useI18n();
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filters, setFilters] = useState<ColumnFilters>({ name: '', value: '', type: '' });
  const [orderKeys, setOrderKeys] = useState<string[] | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const prevRowCount = useRef(flagRows.length);

  useEffect(() => {
    if (canEdit && !fieldsLocked && flagRows.length > prevRowCount.current) {
      requestAnimationFrame(() => {
        const scroll = editorRef.current?.closest('.region-panel-table-scroll');
        if (scroll instanceof HTMLElement) scroll.scrollTop = scroll.scrollHeight;
      });
    }
    prevRowCount.current = flagRows.length;
  }, [flagRows.length, canEdit, fieldsLocked]);

  const title = <strong>{t('region.flags')}</strong>;

  const toggleSort = (key: SortKey) => {
    const nextDir = sortKey === key ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc';
    if (canEdit && !fieldsLocked) {
      const sorted = sortRows(
        flagRows.filter((r) => rowPassesFilters(r, filters, flagsByName)),
        key,
        nextDir,
        flagsByName,
      );
      setOrderKeys(sorted.map((r) => r.key));
    }
    setSortKey(key);
    setSortDir(nextDir);
  };

  const ariaSort = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';

  const filteredView = useMemo(() => {
    const filtered = flagRows.filter((r) => rowPassesFilters(r, filters, flagsByName));
    if (canEdit && !fieldsLocked && orderKeys) {
      const byKey = new Map(filtered.map((r) => [r.key, r]));
      const ordered: FlagRow[] = [];
      for (const key of orderKeys) {
        const row = byKey.get(key);
        if (row) ordered.push(row);
      }
      for (const row of filtered) {
        if (!orderKeys.includes(row.key)) ordered.push(row);
      }
      return ordered;
    }
    return sortRows(filtered, sortKey, sortDir, flagsByName);
  }, [flagRows, filters, sortKey, sortDir, flagsByName, canEdit, fieldsLocked, orderKeys]);

  const rowConflicts = (name: string) =>
    isDirty ? [] : conflictsForDefinedFlag(regionId, name, spatialConflicts, regionsById);

  const editing = canEdit && !fieldsLocked;
  const colCount = 4;

  const filterHead = (
    <tr className="region-effective-filter-row">
      <th className="region-filter-th">
        <FlagNameCombobox
          variant="filter"
          value={filters.name}
          flagsCatalog={flagsCatalog}
          onChange={(v) => setFilters((f) => ({ ...f, name: v }))}
        />
      </th>
      <th>
        <input
          type="search"
          size={1}
          className="search-input region-effective-filter"
          value={filters.value}
          onChange={(e) => setFilters((f) => ({ ...f, value: e.target.value }))}
          placeholder={t('region.columnFilter')}
          aria-label={t('region.flagValue')}
        />
      </th>
      <th>
        <input
          type="search"
          size={1}
          className="search-input region-effective-filter"
          value={filters.type}
          onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
          placeholder={t('region.columnFilter')}
          aria-label={t('region.flagType')}
        />
      </th>
      <th className="region-flags-actions-col" aria-hidden="true" />
    </tr>
  );

  const sortHead = (
    <tr>
      <th aria-sort={ariaSort('name')}>
        <RegionSortButton active={sortKey === 'name'} direction={sortDir} onClick={() => toggleSort('name')}>
          {t('region.flagName')}
        </RegionSortButton>
      </th>
      <th aria-sort={ariaSort('value')}>
        <RegionSortButton active={sortKey === 'value'} direction={sortDir} onClick={() => toggleSort('value')}>
          {t('region.flagValue')}
        </RegionSortButton>
      </th>
      <th aria-sort={ariaSort('type')}>
        <RegionSortButton active={sortKey === 'type'} direction={sortDir} onClick={() => toggleSort('type')}>
          {t('region.flagType')}
        </RegionSortButton>
      </th>
      <th className="region-flags-actions-col" aria-hidden="true" />
    </tr>
  );

  const staticHead = (
    <tr>
      <th>{t('region.flagName')}</th>
      <th>{t('region.flagValue')}</th>
      <th>{t('region.flagType')}</th>
      <th className="region-flags-actions-col" aria-hidden="true" />
    </tr>
  );

  const editorActions = canEdit ? (
    <>
      {flagsError && !fieldsLocked && <p className="flags-manager-error">{flagsError}</p>}
      <div
        className={`modal-actions region-flags-editor-actions${editing ? '' : ' region-flow-hidden'}`}
        aria-hidden={!editing}
      >
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
  ) : null;

  const tableBody = (
    <table className={`flags-table region-effective-table${editing ? ' flags-edit-table' : ''}`}>
      <thead>
        {flagRows.length > 0 ? sortHead : staticHead}
        {flagRows.length > 0 ? filterHead : null}
      </thead>
      <tbody>
        {flagRows.length === 0 ? (
          <tr>
            <td colSpan={colCount}>{t('region.tableEmpty')}</td>
          </tr>
        ) : filteredView.length === 0 ? (
          <tr>
            <td colSpan={colCount} className="region-effective-no-match">{t('region.panelTableNoMatch')}</td>
          </tr>
        ) : (
          filteredView.map((row) => {
            const info = editing ? findFlagInfo(flagsCatalog, row.name) : flagsByName.get(row.name);
            const conflicts = rowConflicts(row.name);
            const valueStr = String(row.value ?? '');
            return (
              <tr key={row.key}>
                <td>
                  {editing ? (
                    <FlagNameCombobox
                      value={row.name}
                      flagsCatalog={flagsCatalog}
                      onChange={(name) => onUpdateFlagRow(row.key, { name })}
                      placeholder={t('flagsManager.namePlaceholder')}
                      onShowOnScheme={onShowFlagOnScheme}
                      unsavedChanges={isDirty}
                    />
                  ) : row.name.trim() ? (
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
                <td className={!editing && conflicts.length > 0 ? 'flag-value--conflict' : undefined}>
                  {editing ? (
                    <div className={conflicts.length > 0 ? 'flag-value-wrap flag-value-wrap--conflict' : 'flag-value-wrap'}>
                      <FlagValueInput
                        value={row.value}
                        flagType={info?.type}
                        onChange={(value) => onUpdateFlagRow(row.key, { value })}
                        placeholder={t('flagsManager.valuePlaceholder')}
                      />
                    </div>
                  ) : (
                    <>
                      {valueStr}
                      {conflicts.length > 0 ? (
                        <ConflictBadge conflicts={conflicts} onShow={onShowConflictOnScheme} />
                      ) : null}
                    </>
                  )}
                </td>
                <td className="region-flags-type-col">{info?.type ?? '—'}</td>
                <td className="region-flags-actions-col">
                  <span className={editing ? undefined : 'region-flow-hidden'}>
                    {editing && conflicts.length > 0 ? (
                      <ConflictBadge conflicts={conflicts} onShow={onShowConflictOnScheme} />
                    ) : null}
                    <button
                      type="button"
                      className="flags-row-remove"
                      disabled={!fieldsEditable}
                      tabIndex={editing ? 0 : -1}
                      onClick={() => onRemoveFlagRow(row.key)}
                      title={t('flagsManager.remove')}
                    >
                      ×
                    </button>
                  </span>
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );

  return (
    <div className="region-flags-editor" ref={editorRef}>
      <RegionPanelTableSection title={title}>
        {tableBody}
      </RegionPanelTableSection>
      {editorActions}
      {fieldsLocked && flagsError && <p className="flags-manager-error">{flagsError}</p>}
    </div>
  );
}
