import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  cancelRegionFlagCoverage,
  pollRegionFlagCoverage,
  startRegionFlagCoverage,
  type RegionFlagCoverageRow,
} from '../../api';
import { useI18n } from '../../i18n/I18nContext';
import type { FlagInfo } from '../../types';
import {
  effectiveRowCategory,
  type EffectiveRowCategory,
} from '../../utils/effectiveRowCategory';
import { compareNatural } from '../../utils/naturalSort';
import { formatCoverageValue } from '../../utils/flagSchemeCoverage';
import { formatCoveragePercent } from '../../utils/formatCoveragePercent';
import type { SpatialConflict } from '../../utils/flagConflicts';
import type { CrossFlagConflict } from '../../utils/crossFlagRules';
import { formatBlockCount } from '../../utils/volume';
import {
  matchesMultiSelect,
  matchesPercentFilter,
  matchesTableSearch,
  type PercentCompareOp,
} from '../../utils/tableSearch';
import { FlagNameCombobox } from '../FlagNameCombobox';
import { CopyCenterButton } from './CopyCenterButton';
import { MultiCheckFilter } from './MultiCheckFilter';
import { NumberFilter } from './NumberFilter';
import { RegionFilterInput } from './RegionFilterInput';
import { RegionPanelTableSection } from './RegionPanelTableSection';
import { RegionSortButton } from './RegionSortButton';

type Props = {
  regionId: string;
  refreshKey: string;
  flagsCatalog: FlagInfo[];
  spatialConflicts: SpatialConflict[];
  crossFlagConflicts?: CrossFlagConflict[];
  focusFlag?: string | null;
  focusFlagSeq?: number;
  onFocusRegion: (id: string) => void;
  onShowConflictOnScheme: (c: SpatialConflict) => void;
};

type SortKey = 'flag' | 'value' | 'percent' | 'blocks' | 'via' | 'inheritType' | 'definedIn';
type SortDir = 'asc' | 'desc';

type ColumnFilters = {
  flag: string;
  value: string;
  percentOp: PercentCompareOp;
  percent: string;
  blocksOp: PercentCompareOp;
  blocks: string;
  via: string;
  categories: Set<EffectiveRowCategory>;
  definedIn: string;
};

function emptyFilters(): ColumnFilters {
  return {
    flag: '',
    value: '',
    percentOp: 'eq',
    percent: '',
    blocksOp: 'eq',
    blocks: '',
    via: '',
    categories: new Set(),
    definedIn: '',
  };
}

const CATEGORY_OPTIONS: EffectiveRowCategory[] = [
  'local',
  'inheritance',
  'containment',
  'intersection',
  'warning',
  'conflict',
];

function InheritSchemeLink({
  label,
  conflicts,
  variant,
  onShow,
}: {
  label: string;
  conflicts: SpatialConflict[];
  variant: 'conflict' | 'warning';
  onShow: (c: SpatialConflict) => void;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLUListElement>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const listId = useId();

  useLayoutEffect(() => {
    if (!open) {
      setBox(null);
      return;
    }
    const anchor = btnRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(280, window.innerWidth - 16);
    let left = rect.left;
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
    setBox({ top: rect.bottom + 4, left, width, maxHeight: 200 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || portalRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (conflicts.length === 0) return <>{label}</>;

  const onClick = () => {
    if (conflicts.length === 1) {
      onShow(conflicts[0]);
      return;
    }
    setOpen((v) => !v);
  };

  return (
    <span ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        className={`region-link region-effective-inherit-link region-effective-inherit-link--${variant}`}
        onClick={onClick}
      >
        {label}
      </button>
      {open && box && conflicts.length > 1 && createPortal(
        <ul
          ref={portalRef}
          id={listId}
          className="region-conflict-badge-menu"
          style={{
            position: 'fixed',
            top: box.top,
            left: box.left,
            width: box.width,
            maxHeight: box.maxHeight,
            zIndex: 10000,
          }}
        >
          {conflicts.map((c) => (
            <li key={`${c.aId}-${c.bId}-${c.flagName}`}>
              <button type="button" onClick={() => { setOpen(false); onShow(c); }}>
                {c.aId} ↔ {c.bId}
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </span>
  );
}

export function RegionEffectiveFlags({
  regionId,
  refreshKey,
  flagsCatalog,
  spatialConflicts,
  crossFlagConflicts = [],
  focusFlag = null,
  focusFlagSeq = 0,
  onFocusRegion,
  onShowConflictOnScheme,
}: Props) {
  const { t } = useI18n();
  const [rows, setRows] = useState<RegionFlagCoverageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('flag');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filters, setFilters] = useState<ColumnFilters>(emptyFilters);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [expandSignal, setExpandSignal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let jobId = '';
    setLoading(true);
    setError(null);
    setRows(null);
    setPercent(0);

    const poll = async () => {
      if (cancelled || !jobId) return;
      try {
        const status = await pollRegionFlagCoverage(jobId);
        if (cancelled) return;
        setPercent(Math.max(0, Math.min(100, status.percent)));
        if (status.rows.length > 0) setRows(status.rows);
        if (status.error) {
          setError(status.error);
          setLoading(false);
          return;
        }
        if (status.done) {
          setRows(status.rows);
          setPercent(100);
          setLoading(false);
          return;
        }
        timer = window.setTimeout(() => {
          void poll();
        }, 300);
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      }
    };

    void startRegionFlagCoverage(regionId)
      .then((id) => {
        if (cancelled) {
          cancelRegionFlagCoverage(id);
          return;
        }
        jobId = id;
        void poll();
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (jobId) cancelRegionFlagCoverage(jobId);
    };
  }, [regionId, refreshKey]);

  useEffect(() => {
    if (!focusFlag) return;
    setFilters((prev) => ({ ...prev, flag: focusFlag }));
    setExpandSignal((n) => n + 1);
  }, [focusFlag, focusFlagSeq, regionId]);

  useEffect(() => {
    if (!focusFlag || loading || rows === null) return;
    const scrollToEffectiveFlags = () => {
      const section = document.getElementById('region-effective-flags');
      const modal = section?.closest('.modal-body');
      if (!(section instanceof HTMLElement) || !(modal instanceof HTMLElement)) return;
      const sectionTop = section.getBoundingClientRect().top;
      const modalTop = modal.getBoundingClientRect().top;
      modal.scrollTop += sectionTop - modalTop;
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToEffectiveFlags);
    });
  }, [focusFlag, focusFlagSeq, regionId, loading, rows, expandSignal]);

  const categoryLabel = (cat: EffectiveRowCategory) => t(`region.inheritType.${cat}`);

  const inheritTypeLabel = (row: RegionFlagCoverageRow) =>
    categoryLabel(effectiveRowCategory(row));

  const valueLabel = (row: RegionFlagCoverageRow) =>
    effectiveRowCategory(row) === 'conflict'
      ? t('region.valueUndefined')
      : formatCoverageValue(row.value);

  const viaSuggestions = useMemo(() => {
    if (!rows) return [];
    const ids = new Set<string>();
    for (const row of rows) {
      if (row.viaRegion) ids.add(row.viaRegion);
    }
    return [...ids];
  }, [rows]);

  const definedInSuggestions = useMemo(() => {
    if (!rows) return [];
    const ids = new Set<string>();
    for (const row of rows) {
      if (row.definedIn) ids.add(row.definedIn);
    }
    return [...ids];
  }, [rows]);

  const crossHitsByFlag = useMemo(() => {
    const map = new Map<string, CrossFlagConflict>();
    for (const hit of crossFlagConflicts) {
      if (hit.regionId !== regionId && hit.otherRegionId !== regionId) continue;
      for (const f of hit.flags) {
        if (!map.has(f.name)) map.set(f.name, hit);
      }
    }
    return map;
  }, [crossFlagConflicts, regionId]);

  const conflictCount = useMemo(() => {
    if (!rows) return 0;
    return rows.filter((r) => effectiveRowCategory(r) === 'conflict').length;
  }, [rows]);

  const categoryFilterOptions = useMemo(
    () => CATEGORY_OPTIONS.map((value) => ({ value, label: categoryLabel(value) })),
    [t],
  );

  const filteredSorted = useMemo(() => {
    if (!rows) return [];
    let list = [...rows];

    list = list.filter((row) => {
      if (errorsOnly && effectiveRowCategory(row) !== 'conflict') return false;
      if (!matchesTableSearch(row.flag, filters.flag)) return false;
      if (!matchesTableSearch(valueLabel(row), filters.value)) return false;
      if (!matchesPercentFilter(row.percent, filters.percentOp, filters.percent)) return false;
      if (!matchesPercentFilter(row.blocks ?? 0, filters.blocksOp, filters.blocks)) return false;
      if (!matchesTableSearch(row.viaRegion ?? '', filters.via)) return false;
      if (!matchesMultiSelect(effectiveRowCategory(row), filters.categories, 6)) return false;
      if (!matchesTableSearch(row.definedIn ?? '', filters.definedIn)) return false;
      return true;
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    const defaultFlagSort = sortKey === 'flag' && sortDir === 'asc';
    list.sort((a, b) => {
      if (defaultFlagSort) {
        const ac = effectiveRowCategory(a) === 'conflict' ? 0 : 1;
        const bc = effectiveRowCategory(b) === 'conflict' ? 0 : 1;
        if (ac !== bc) return ac - bc;
        return compareNatural(a.flag, b.flag);
      }
      const cmpStr = (x: string, y: string) => compareNatural(x, y) * dir;
      const cmpNum = (x: number, y: number) => (x === y ? 0 : x < y ? -1 : 1) * dir;
      switch (sortKey) {
        case 'flag':
          return cmpStr(a.flag, b.flag);
        case 'value':
          return cmpStr(valueLabel(a), valueLabel(b));
        case 'percent':
          return cmpNum(a.percent, b.percent);
        case 'blocks':
          return cmpNum(a.blocks ?? 0, b.blocks ?? 0);
        case 'via':
          return cmpStr(a.viaRegion ?? '', b.viaRegion ?? '');
        case 'inheritType':
          return cmpStr(inheritTypeLabel(a), inheritTypeLabel(b));
        case 'definedIn':
          return cmpStr(a.definedIn ?? '', b.definedIn ?? '');
        default:
          return 0;
      }
    });
    return list;
  }, [rows, sortKey, sortDir, filters, errorsOnly, t]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'percent' || key === 'blocks' ? 'desc' : 'asc');
  };

  const setFilter = <K extends keyof ColumnFilters>(key: K, value: ColumnFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const ariaSort = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';

  const loadingMessage =
    loading && (!rows || rows.length === 0) && percent < 30
      ? t('region.effectiveFlagsPreparing', { percent: percent.toFixed(1) })
      : t('region.effectiveFlagsLoading', { percent: percent.toFixed(1) });

  const showTable = rows != null;

  const rowSpatialConflicts = (row: RegionFlagCoverageRow, ambiguous: boolean) =>
    spatialConflicts.filter(
      (c) =>
        c.ambiguous === ambiguous
        && c.flagName === row.flag
        && (c.aId === regionId || c.bId === regionId),
    );

  return (
    <div className="region-effective-flags" id="region-effective-flags">
      {loading && (
        <p className="region-effective-loading">{loadingMessage}</p>
      )}
      {error && <p className="flags-manager-error">{error}</p>}
      {showTable && (
        <RegionPanelTableSection
          expandSignal={expandSignal}
          title={(
            <strong>
              {t('region.effectiveFlags')}
              {conflictCount > 0 ? (
                <span className="region-conflict-count"> ({conflictCount})</span>
              ) : null}
            </strong>
          )}
          actions={(
            <label className="region-errors-only-toggle">
              <input
                type="checkbox"
                checked={errorsOnly}
                disabled={conflictCount === 0}
                onChange={(e) => setErrorsOnly(e.target.checked)}
              />
              {t('region.effectiveErrorsOnly')}
            </label>
          )}
        >
          <table className="flags-table region-effective-table">
            <thead>
              <tr>
                <th aria-sort={ariaSort('flag')}>
                  <RegionSortButton
                    active={sortKey === 'flag'}
                    direction={sortDir}
                    onClick={() => toggleSort('flag')}
                  >
                    {t('region.effectiveFlagName')}
                  </RegionSortButton>
                </th>
                <th aria-sort={ariaSort('value')}>
                  <RegionSortButton
                    active={sortKey === 'value'}
                    direction={sortDir}
                    onClick={() => toggleSort('value')}
                  >
                    {t('region.effectiveValue')}
                  </RegionSortButton>
                </th>
                <th className="region-num-col" aria-sort={ariaSort('percent')}>
                  <RegionSortButton
                    active={sortKey === 'percent'}
                    direction={sortDir}
                    onClick={() => toggleSort('percent')}
                  >
                    {t('region.effectivePercent')}
                  </RegionSortButton>
                </th>
                <th className="region-num-col" aria-sort={ariaSort('blocks')}>
                  <RegionSortButton
                    active={sortKey === 'blocks'}
                    direction={sortDir}
                    onClick={() => toggleSort('blocks')}
                  >
                    {t('region.effectiveBlocks')}
                  </RegionSortButton>
                </th>
                <th aria-sort={ariaSort('via')}>
                  <RegionSortButton
                    active={sortKey === 'via'}
                    direction={sortDir}
                    onClick={() => toggleSort('via')}
                  >
                    {t('region.effectiveVia')}
                  </RegionSortButton>
                </th>
                <th aria-sort={ariaSort('inheritType')}>
                  <RegionSortButton
                    active={sortKey === 'inheritType'}
                    direction={sortDir}
                    onClick={() => toggleSort('inheritType')}
                  >
                    {t('region.effectiveInheritType')}
                  </RegionSortButton>
                </th>
                <th aria-sort={ariaSort('definedIn')}>
                  <RegionSortButton
                    active={sortKey === 'definedIn'}
                    direction={sortDir}
                    onClick={() => toggleSort('definedIn')}
                  >
                    {t('region.effectiveDefinedIn')}
                  </RegionSortButton>
                </th>
                <th className="region-copy-center-col">{t('region.effectiveCenterCol')}</th>
              </tr>
              <tr className="region-effective-filter-row">
                <th className="region-filter-th">
                  <FlagNameCombobox
                    variant="filter"
                    value={filters.flag}
                    flagsCatalog={flagsCatalog}
                    onChange={(v) => setFilter('flag', v)}
                  />
                </th>
                <th>
                  <input
                    type="search"
                    size={1}
                    className="search-input region-effective-filter"
                    value={filters.value}
                    onChange={(e) => setFilter('value', e.target.value)}
                    placeholder={t('region.columnFilter')}
                    aria-label={t('region.effectiveValue')}
                  />
                </th>
                <th>
                  <NumberFilter
                    op={filters.percentOp}
                    value={filters.percent}
                    onOpChange={(op) => setFilter('percentOp', op)}
                    onValueChange={(v) => setFilter('percent', v)}
                    ariaLabel={t('region.effectivePercent')}
                  />
                </th>
                <th>
                  <NumberFilter
                    op={filters.blocksOp}
                    value={filters.blocks}
                    onOpChange={(op) => setFilter('blocksOp', op)}
                    onValueChange={(v) => setFilter('blocks', v)}
                    ariaLabel={t('region.effectiveBlocks')}
                    placeholder={t('region.intersectColBlocks')}
                  />
                </th>
                <th>
                  <RegionFilterInput
                    value={filters.via}
                    onChange={(v) => setFilter('via', v)}
                    suggestions={viaSuggestions}
                    ariaLabel={t('region.effectiveVia')}
                  />
                </th>
                <th className="region-filter-th">
                  <MultiCheckFilter
                    options={categoryFilterOptions}
                    selected={filters.categories}
                    onChange={(next) => setFilter('categories', next as Set<EffectiveRowCategory>)}
                    ariaLabel={t('region.effectiveInheritType')}
                    allLabel={t('region.inheritFilterAll')}
                  />
                </th>
                <th>
                  <RegionFilterInput
                    value={filters.definedIn}
                    onChange={(v) => setFilter('definedIn', v)}
                    suggestions={definedInSuggestions}
                    ariaLabel={t('region.effectiveDefinedIn')}
                  />
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows!.length === 0 ? (
                <tr>
                  <td colSpan={8}>{t('region.tableEmpty')}</td>
                </tr>
              ) : filteredSorted.length === 0 ? (
                <tr>
                  <td colSpan={8} className="region-effective-no-match">
                    {t('region.panelTableNoMatch')}
                  </td>
                </tr>
              ) : (
                filteredSorted.map((row, idx) => {
                  const cat = effectiveRowCategory(row);
                  const showSpatialCopy =
                    row.viaRegion
                    && (row.inheritType === 'containment' || row.inheritType === 'intersection');
                  const ambiguousConflicts = cat === 'conflict' ? rowSpatialConflicts(row, true) : [];
                  const warningConflicts = cat === 'warning' ? rowSpatialConflicts(row, false) : [];
                  const crossHit = crossHitsByFlag.get(row.flag);
                  const valText = valueLabel(row);
                  const rowClass = [
                    cat === 'conflict' ? 'region-effective-row--conflict' : '',
                    cat === 'warning' ? 'region-effective-row--warning' : '',
                    crossHit ? 'region-effective-row--cross' : '',
                  ].filter(Boolean).join(' ') || undefined;
                  const inheritCell = (cat === 'conflict' || cat === 'warning') ? (
                    <InheritSchemeLink
                      label={inheritTypeLabel(row)}
                      conflicts={cat === 'conflict' ? ambiguousConflicts : warningConflicts}
                      variant={cat === 'conflict' ? 'conflict' : 'warning'}
                      onShow={onShowConflictOnScheme}
                    />
                  ) : (
                    inheritTypeLabel(row)
                  );
                  return (
                    <tr
                      key={`${row.flag}-${row.viaRegion}-${row.definedIn}-${idx}`}
                      className={rowClass}
                      title={crossHit ? t(crossHit.reasonKey as Parameters<typeof t>[0]) : undefined}
                    >
                      <td>{row.flag}</td>
                      <td className="region-value-cell" title={valText}>{valText}</td>
                      <td className="region-num-col">{formatCoveragePercent(row.percent)}</td>
                      <td className="region-num-col">
                        {row.blocks == null ? '—' : formatBlockCount(row.blocks)}
                      </td>
                      <td>
                        {cat === 'local' || cat === 'conflict' ? (
                          '—'
                        ) : row.viaRegion ? (
                          <button
                            type="button"
                            className="region-link"
                            onClick={() => onFocusRegion(row.viaRegion!)}
                          >
                            {row.viaRegion}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{inheritCell}</td>
                      <td>
                        {cat === 'local' || cat === 'conflict' ? (
                          '—'
                        ) : row.definedIn ? (
                          <button
                            type="button"
                            className="region-link"
                            onClick={() => onFocusRegion(row.definedIn!)}
                          >
                            {row.definedIn}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="region-copy-center-col">
                        {showSpatialCopy && row.viaRegion ? (
                          <CopyCenterButton regionId={regionId} otherRegionId={row.viaRegion} />
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </RegionPanelTableSection>
      )}
    </div>
  );
}
