import { useMemo, useState, type CSSProperties } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { FlagInfo, RegionData, SpatialEdge } from '../types';
import type { SpatialRelationsGrouped } from '../utils/graph';
import { compareNatural } from '../utils/naturalSort';
import { isTemporaryRegion } from '../utils/regions';
import { regionHasNonStandardHeight } from '../utils/worldHeight';
import {
  findIntersectOverlapBlocks,
  formatBlockCount,
  intersectionVolume,
  regionVolume,
} from '../utils/volume';
import { ModalOverlay } from './ModalOverlay';
import { ConfirmDialog } from './ConfirmDialog';
import { RegionGeometryEditor, type GeometryPayload } from './RegionGeometryEditor';
import { useRegionDraftState } from '../hooks/useRegionDraftState';
import { RegionPanelHeader } from './region/RegionPanelHeader';
import { RegionParentEditor } from './region/RegionParentEditor';
import { RegionFlagsEditor } from './region/RegionFlagsEditor';
import { RegionEffectiveFlags } from './region/RegionEffectiveFlags';
import { RegionMembersEditor } from './region/RegionMembersEditor';
import { RegionPanelTableSection } from './region/RegionPanelTableSection';
import { formatCoveragePercent } from '../utils/formatCoveragePercent';
import { matchesPercentFilter, matchesTableSearch, type PercentCompareOp } from '../utils/tableSearch';
import { CopyCenterButton } from './region/CopyCenterButton';
import { NumberFilter } from './region/NumberFilter';
import { RegionFilterInput } from './region/RegionFilterInput';
import { RegionSortButton } from './region/RegionSortButton';
import { IconAdd } from './GraphControlIcons';
import { SearchPanel } from './SearchPanel';
import { checkCanAddChild } from '../utils/regionHierarchy';
import type { SpatialConflict } from '../utils/flagConflicts';

interface RegionPanelProps {
  region: RegionData;
  childIds: string[];
  spatialRelations: SpatialRelationsGrouped;
  spatialEdges: SpatialEdge[];
  regionsById: Map<string, RegionData>;
  flagsCatalog: FlagInfo[];
  regionIds: string[];
  /** Hierarchy nesting depth from forest (0 = root). Read-only in UI. */
  hierarchyDepth?: number;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onHistoryBack?: () => void;
  onHistoryForward?: () => void;
  onClose: () => void;
  onFocusRegion: (regionId: string) => void;
  onDeleteManual?: (regionId: string) => void;
  canDelete?: boolean;
  onUpdateParent?: (regionId: string, parent: string | null) => Promise<void>;
  onUpdateFlags?: (regionId: string, flags: Record<string, unknown>) => Promise<void>;
  onUpdateGeometry?: (regionId: string, payload: GeometryPayload) => Promise<void>;
  /** Opens the same rename dialog as the scheme context menu. */
  onRequestRename?: (regionId: string) => void;
  onUpdatePriority?: (regionId: string, priority: number) => Promise<void>;
  onUpdateMembers?: (
    regionId: string,
    owners: Record<string, unknown>,
    members: Record<string, unknown>,
  ) => Promise<void>;
  /** Open flag highlight scheme for a saved flag name. */
  onShowFlagOnScheme?: (flagName: string) => void;
  /** Batch region panel save into one history entry. */
  runSaveBatch?: (regionId: string, fn: () => Promise<void>) => Promise<void>;
  spatialConflicts?: SpatialConflict[];
  crossFlagConflicts?: import('../utils/crossFlagRules').CrossFlagConflict[];
  effectiveFlagsFocus?: string | null;
  effectiveFlagsFocusSeq?: number;
  onShowConflictOnScheme?: (c: SpatialConflict) => void;
}

type IntersectSortKey = 'id' | 'blocks' | 'percent';
type SortDir = 'asc' | 'desc';

function PartnerList({
  ids,
  onFocusRegion,
}: {
  ids: string[];
  onFocusRegion: (id: string) => void;
}) {
  const { t } = useI18n();
  const sorted = useMemo(() => [...ids].sort(compareNatural), [ids]);

  return (
    <div className="region-link-table-inner">
      <table className="flags-table region-effective-table">
        <thead>
          <tr>
            <th>{t('region.intersectColRegion')}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td>{t('region.tableEmpty')}</td>
            </tr>
          ) : (
            sorted.map((pid) => (
              <tr key={pid}>
                <td>
                  <button type="button" className="region-link" onClick={() => onFocusRegion(pid)}>
                    {pid}
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

type IntersectColumnFilters = {
  id: string;
  blocksOp: PercentCompareOp;
  blocks: string;
  percentOp: PercentCompareOp;
  percent: string;
};

const EMPTY_INTERSECT_FILTERS: IntersectColumnFilters = {
  id: '',
  blocksOp: 'eq',
  blocks: '',
  percentOp: 'eq',
  percent: '',
};

function IntersectsPartnerTable({
  region,
  partnerIds,
  spatialEdges,
  regionsById,
  emptyText,
  onFocusRegion,
}: {
  region: RegionData;
  partnerIds: string[];
  spatialEdges: SpatialEdge[];
  regionsById: Map<string, RegionData>;
  emptyText: string;
  onFocusRegion: (id: string) => void;
}) {
  const { t } = useI18n();
  const [sortKey, setSortKey] = useState<IntersectSortKey>('id');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filters, setFilters] = useState<IntersectColumnFilters>(EMPTY_INTERSECT_FILTERS);

  const selfVolume = useMemo(() => regionVolume(region), [region]);

  const rows = useMemo(() => {
    return partnerIds
      .map((id) => {
        const fromEdge = findIntersectOverlapBlocks(spatialEdges, region.id, id);
        let blocks: number | null;
        if (typeof fromEdge === 'number') {
          blocks = fromEdge;
        } else {
          const partner = regionsById.get(id);
          blocks = partner ? intersectionVolume(region, partner) : null;
        }
        const percent =
          blocks != null && selfVolume != null && selfVolume > 0
            ? (blocks / selfVolume) * 100
            : null;
        return { id, blocks, percent };
      })
      .filter((row) => row.blocks !== 0);
  }, [partnerIds, spatialEdges, region, regionsById, selfVolume]);

  const regionSuggestions = useMemo(() => partnerIds, [partnerIds]);

  const sorted = useMemo(() => {
    const list = rows.filter((row) => {
      if (!matchesTableSearch(row.id, filters.id)) return false;
      if (!matchesPercentFilter(row.blocks ?? 0, filters.blocksOp, filters.blocks)) return false;
      if (!matchesPercentFilter(row.percent ?? 0, filters.percentOp, filters.percent)) return false;
      return true;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sortKey === 'id') {
        return compareNatural(a.id, b.id) * dir;
      }
      const av = sortKey === 'blocks' ? a.blocks : a.percent;
      const bv = sortKey === 'blocks' ? b.blocks : b.percent;
      if (av == null && bv == null) return compareNatural(a.id, b.id);
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av !== bv) return (av < bv ? -1 : 1) * dir;
      return compareNatural(a.id, b.id);
    });
    return list;
  }, [rows, sortKey, sortDir, filters]);

  const toggleSort = (key: IntersectSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'id' ? 'asc' : 'desc');
  };

  const sortTitle = sortDir === 'asc' ? t('region.intersectSortAsc') : t('region.intersectSortDesc');

  return (
    <div className="region-link-table-inner region-link-table-inner--intersects">
      <table className="flags-table region-effective-table">
        <thead>
          <tr>
            <th>
              <RegionSortButton
                active={sortKey === 'id'}
                direction={sortDir}
                onClick={() => toggleSort('id')}
                title={sortTitle}
              >
                {t('region.intersectColRegion')}
              </RegionSortButton>
            </th>
            <th className="region-num-col">
              <RegionSortButton
                active={sortKey === 'blocks'}
                direction={sortDir}
                onClick={() => toggleSort('blocks')}
                title={sortTitle}
              >
                {t('region.intersectColBlocks')}
              </RegionSortButton>
            </th>
            <th className="region-num-col">
              <RegionSortButton
                active={sortKey === 'percent'}
                direction={sortDir}
                onClick={() => toggleSort('percent')}
                title={sortTitle}
              >
                {t('region.intersectColPercent')}
              </RegionSortButton>
            </th>
            <th className="region-copy-center-col">{t('region.effectiveCenterCol')}</th>
          </tr>
          <tr className="region-effective-filter-row">
            <th>
              <RegionFilterInput
                value={filters.id}
                onChange={(v) => setFilters((prev) => ({ ...prev, id: v }))}
                suggestions={regionSuggestions}
                ariaLabel={t('region.intersectColRegion')}
              />
            </th>
            <th>
              <NumberFilter
                op={filters.blocksOp}
                value={filters.blocks}
                onOpChange={(op) => setFilters((prev) => ({ ...prev, blocksOp: op }))}
                onValueChange={(v) => setFilters((prev) => ({ ...prev, blocks: v }))}
                ariaLabel={t('region.intersectColBlocks')}
              />
            </th>
            <th>
              <NumberFilter
                op={filters.percentOp}
                value={filters.percent}
                onOpChange={(op) => setFilters((prev) => ({ ...prev, percentOp: op }))}
                onValueChange={(v) => setFilters((prev) => ({ ...prev, percent: v }))}
                ariaLabel={t('region.intersectColPercent')}
                placeholder="%"
              />
            </th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4}>{t('region.tableEmpty')}</td>
            </tr>
          ) : sorted.length === 0 ? (
            <tr>
              <td colSpan={4} className="region-effective-no-match">
                {t('region.panelTableNoMatch')}
              </td>
            </tr>
          ) : (
            sorted.map((row) => (
              <tr key={row.id}>
                <td>
                  <button type="button" className="region-link" onClick={() => onFocusRegion(row.id)}>
                    {row.id}
                  </button>
                </td>
                <td className="region-num-col">
                  {row.blocks == null ? '—' : formatBlockCount(row.blocks)}
                </td>
                <td className="region-num-col">
                  {row.percent == null ? '—' : formatCoveragePercent(row.percent)}
                </td>
                <td className="region-copy-center-col">
                  <CopyCenterButton regionId={region.id} otherRegionId={row.id} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ChildrenPartnerTable({
  ids,
  onFocusRegion,
}: {
  ids: string[];
  onFocusRegion: (id: string) => void;
}) {
  const { t } = useI18n();
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filter, setFilter] = useState('');

  const sorted = useMemo(() => {
    const list = ids.filter((id) => matchesTableSearch(id, filter));
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => compareNatural(a, b) * dir);
    return list;
  }, [ids, filter, sortDir]);

  const regionColWidth = useMemo(() => {
    const maxLen = ids.reduce((m, id) => Math.max(m, id.length), 0);
    return `min(100%, max(16rem, ${maxLen}ch))`;
  }, [ids]);

  const sortTitle = sortDir === 'asc' ? t('region.intersectSortAsc') : t('region.intersectSortDesc');

  return (
    <div className="region-link-table-inner region-link-table-inner--contains region-link-table-inner--full">
      <table
        className="flags-table region-effective-table region-contains-table region-children-table"
        style={{ '--region-contains-col': regionColWidth } as CSSProperties}
      >
        <thead>
          <tr>
            <th aria-sort={sortDir === 'asc' ? 'ascending' : 'descending'} style={{ width: regionColWidth }}>
              <RegionSortButton
                active
                direction={sortDir}
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                title={sortTitle}
              >
                {t('region.intersectColRegion')}
              </RegionSortButton>
            </th>
          </tr>
          <tr className="region-effective-filter-row">
            <th>
              <RegionFilterInput
                value={filter}
                onChange={setFilter}
                suggestions={ids}
                ariaLabel={t('region.intersectColRegion')}
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {ids.length === 0 ? (
            <tr>
              <td>{t('region.tableEmpty')}</td>
            </tr>
          ) : sorted.length === 0 ? (
            <tr>
              <td className="region-effective-no-match">{t('region.panelTableNoMatch')}</td>
            </tr>
          ) : (
            sorted.map((pid) => (
              <tr key={pid}>
                <td>
                  <button type="button" className="region-link" onClick={() => onFocusRegion(pid)}>
                    {pid}
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ContainsPartnerTable({
  ids,
  onFocusRegion,
}: {
  ids: string[];
  onFocusRegion: (id: string) => void;
}) {
  const { t } = useI18n();
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filter, setFilter] = useState('');

  const sorted = useMemo(() => {
    const list = ids.filter((id) => matchesTableSearch(id, filter));
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => compareNatural(a, b) * dir);
    return list;
  }, [ids, filter, sortDir]);

  const regionColWidth = useMemo(() => {
    const maxLen = ids.reduce((m, id) => Math.max(m, id.length), 0);
    return `min(100%, max(16rem, ${maxLen}ch))`;
  }, [ids]);

  const sortTitle = sortDir === 'asc' ? t('region.intersectSortAsc') : t('region.intersectSortDesc');

  return (
    <div className="region-link-table-inner region-link-table-inner--contains">
      <table
        className="flags-table region-effective-table region-contains-table"
        style={{ '--region-contains-col': regionColWidth } as CSSProperties}
      >
        <thead>
          <tr>
            <th aria-sort={sortDir === 'asc' ? 'ascending' : 'descending'} style={{ width: regionColWidth }}>
              <RegionSortButton
                active
                direction={sortDir}
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                title={sortTitle}
              >
                {t('region.intersectColRegion')}
              </RegionSortButton>
            </th>
          </tr>
          <tr className="region-effective-filter-row">
            <th>
              <RegionFilterInput
                value={filter}
                onChange={setFilter}
                suggestions={ids}
                ariaLabel={t('region.intersectColRegion')}
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {ids.length === 0 ? (
            <tr>
              <td>{t('region.tableEmpty')}</td>
            </tr>
          ) : sorted.length === 0 ? (
            <tr>
              <td className="region-effective-no-match">{t('region.panelTableNoMatch')}</td>
            </tr>
          ) : (
            sorted.map((pid) => (
              <tr key={pid}>
                <td>
                  <button type="button" className="region-link" onClick={() => onFocusRegion(pid)}>
                    {pid}
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function RegionPanel({
  region,
  childIds,
  spatialRelations,
  spatialEdges,
  regionsById,
  flagsCatalog,
  regionIds,
  hierarchyDepth = 0,
  canGoBack = false,
  canGoForward = false,
  onHistoryBack,
  onHistoryForward,
  onClose,
  onFocusRegion,
  onDeleteManual,
  onUpdateParent,
  onUpdateFlags,
  onUpdateGeometry,
  onRequestRename,
  onUpdatePriority,
  onUpdateMembers,
  onShowFlagOnScheme,
  runSaveBatch,
  spatialConflicts = [],
  crossFlagConflicts = [],
  effectiveFlagsFocus = null,
  effectiveFlagsFocusSeq = 0,
  onShowConflictOnScheme,
}: RegionPanelProps) {
  const { t } = useI18n();
  const flagsByName = useMemo(
    () => new Map(flagsCatalog.map((f) => [f.name, f])),
    [flagsCatalog],
  );

  const isTemp = isTemporaryRegion(region);
  const canEditGeometry = Boolean(onUpdateGeometry);

  const draft = useRegionDraftState({
    region,
    childIds,
    regionIds,
    flagsCatalog,
    onUpdateParent,
    onUpdateFlags,
    onUpdateGeometry,
    onUpdatePriority,
    onUpdateMembers,
    runSaveBatch: runSaveBatch
      ? (fn) => runSaveBatch(region.id, fn)
      : undefined,
  });

  const {
    fieldsLocked,
    setFieldsLocked,
    editingParent,
    setEditingParent,
    parentQuery,
    setParentQuery,
    parentError,
    setParentError,
    geometry,
    geometryError,
    flagRows,
    flagsError,
    priorityDraft,
    setPriorityDraft,
    priorityError,
    setPriorityError,
    ownersPlayers,
    setOwnersPlayers,
    ownersUniqueIds,
    setOwnersUniqueIds,
    membersPlayers,
    setMembersPlayers,
    membersUniqueIds,
    setMembersUniqueIds,
    membersError,
    saveBusy,
    parentCandidates,
    resolvedParent,
    isDirty,
    fieldsEditable,
    onGeometryChange,
    updateFlagRow,
    removeFlagRow,
    addFlagRow,
    clearAllFlagRows,
    markMembersDirty,
    discardChanges,
    saveAll,
  } = draft;

  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showClearFlagsConfirm, setShowClearFlagsConfirm] = useState(false);
  const [showAddChildSearch, setShowAddChildSearch] = useState(false);
  const [pendingChild, setPendingChild] = useState<{ id: string; moveFrom: string | null } | null>(null);
  const [addChildError, setAddChildError] = useState<string | null>(null);
  const [pendingLeave, setPendingLeave] = useState<null | (() => void)>(null);
  const [pendingMembersClear, setPendingMembersClear] = useState<null | (() => void)>(null);

  const sortedChildIds = useMemo(() => [...childIds].sort(compareNatural), [childIds]);

  const sortedSpatial = useMemo(() => ({
    intersects: [...spatialRelations.intersects].sort(compareNatural),
    containedIn: [...spatialRelations.containedIn].sort(compareNatural),
    contains: [...spatialRelations.contains].sort(compareNatural),
  }), [spatialRelations]);

  const requestLeave = (action: () => void) => {
    if (isDirty) {
      setPendingLeave(() => action);
      setShowUnsavedConfirm(true);
      return;
    }
    action();
  };

  const requestClose = () => {
    requestLeave(onClose);
  };

  const navigateToRegion = (regionId: string) => {
    if (regionId === region.id) return;
    requestLeave(() => onFocusRegion(regionId));
  };

  const requestHistoryBack = () => {
    if (!onHistoryBack || !canGoBack) return;
    requestLeave(onHistoryBack);
  };

  const requestHistoryForward = () => {
    if (!onHistoryForward || !canGoForward) return;
    requestLeave(onHistoryForward);
  };

  const addChildCandidates = useMemo(() => {
    const map = new Map<string, { parent?: string | null }>();
    for (const [id, r] of regionsById) map.set(id, { parent: r.parent });
    return regionIds.filter((id) => checkCanAddChild(region.id, id, map).ok);
  }, [region.id, regionIds, regionsById]);

  const handleAddChildSelect = (childId: string) => {
    const map = new Map<string, { parent?: string | null }>();
    for (const [id, r] of regionsById) map.set(id, { parent: r.parent });
    const check = checkCanAddChild(region.id, childId, map);
    if (!check.ok) {
      setAddChildError(t(`region.addChildError.${check.reason}`));
      return;
    }
    setAddChildError(null);
    if (check.moveFrom) {
      setPendingChild({ id: childId, moveFrom: check.moveFrom });
      setShowAddChildSearch(false);
      return;
    }
    void onUpdateParent?.(childId, region.id).then(() => {
      setShowAddChildSearch(false);
    }).catch((err) => setAddChildError(String(err)));
  };

  const requestClearFlags = () => {
    if (!fieldsEditable || flagRows.length === 0) return;
    setShowClearFlagsConfirm(true);
  };

  const requestDiscard = () => {
    if (!isDirty || saveBusy) return;
    setShowDiscardConfirm(true);
  };


  const totalSpatial =
    sortedSpatial.intersects.length
    + sortedSpatial.containedIn.length
    + sortedSpatial.contains.length;

  const lockedParentLabel = parentQuery.trim() || null;
  const lockedParentNavId =
    lockedParentLabel == null
      ? null
      : (resolvedParent
        ?? regionIds.find((id) => id.toLowerCase() === lockedParentLabel.toLowerCase())
        ?? null);

  return (
    <>
    <ModalOverlay onClose={requestClose}>
      <div className="modal region-panel-modal" onClick={(e) => e.stopPropagation()}>
        <RegionPanelHeader
          regionId={region.id}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          fieldsLocked={fieldsLocked}
          saveBusy={saveBusy}
          isDirty={isDirty}
          onHistoryBack={requestHistoryBack}
          onHistoryForward={requestHistoryForward}
          onRequestRename={onRequestRename}
          onToggleLock={() => setFieldsLocked((v) => {
            if (!v) setEditingParent(false);
            return !v;
          })}
          onDiscard={requestDiscard}
          onSave={() => { void saveAll(); }}
          onClose={requestClose}
        />

        <div className="modal-body">
          <div className="region-hierarchy-block">
          <RegionParentEditor
            fieldsLocked={fieldsLocked}
            fieldsEditable={fieldsEditable}
            editingParent={editingParent}
            parentQuery={parentQuery}
            parentError={parentError}
            parentCandidates={parentCandidates}
            resolvedParent={resolvedParent}
            lockedParentLabel={lockedParentLabel}
            lockedParentNavId={lockedParentNavId}
            canEditParent={Boolean(onUpdateParent)}
            currentParent={region.parent ?? null}
            onBeginEdit={() => {
              setParentQuery(region.parent ?? '');
              setParentError(null);
              setEditingParent(true);
            }}
            onNavigate={navigateToRegion}
            onParentQueryChange={(value) => {
              setParentQuery(value);
              setParentError(null);
            }}
            onClearParent={() => {
              setParentQuery('');
              setParentError(null);
            }}
          />

          <div className="region-priority-block">
            <p>
              <strong>{t('region.priority')}:</strong>{' '}
              <span className="region-priority-inline">
                {onUpdatePriority ? (
                  <input
                    className={`search-input region-priority-input${fieldsLocked ? ' region-flow-hidden' : ''}`}
                    type="number"
                    step={1}
                    value={priorityDraft}
                    disabled={!fieldsEditable || fieldsLocked}
                    tabIndex={fieldsLocked ? -1 : 0}
                    aria-hidden={fieldsLocked}
                    onChange={(e) => {
                      setPriorityDraft(e.target.value);
                      setPriorityError(null);
                    }}
                  />
                ) : null}
                <span className={onUpdatePriority && !fieldsLocked ? 'region-flow-hidden' : undefined}>
                  {priorityDraft.trim() || region.priority}
                </span>
              </span>
            </p>
            {priorityError && <p className="flags-manager-error">{priorityError}</p>}
          </div>

          <div className="region-depth-block">
            <p>
              <strong>{t('region.nestingLevel')}:</strong>{' '}
              {hierarchyDepth}
            </p>
          </div>
          </div>

          <div className="partners-block children-block">
            {addChildError && <p className="flags-manager-error">{addChildError}</p>}
            <RegionPanelTableSection
              title={
                <span className="region-meta-label">
                  {t('region.children', { count: sortedChildIds.length })}
                </span>
              }
              actions={
                <button
                  type="button"
                  className={`icon-btn region-add-child-btn${fieldsLocked ? ' region-flow-hidden' : ''}`}
                  title={isDirty ? t('region.addChildSaveFirst') : t('region.addChild')}
                  aria-label={t('region.addChild')}
                  disabled={!onUpdateParent || saveBusy || fieldsLocked}
                  tabIndex={fieldsLocked ? -1 : 0}
                  onClick={() => {
                    if (isDirty) {
                      requestLeave(() => setShowAddChildSearch(true));
                      return;
                    }
                    setShowAddChildSearch(true);
                  }}
                >
                  <IconAdd size={20} />
                </button>
              }
            >
              <ChildrenPartnerTable ids={sortedChildIds} onFocusRegion={navigateToRegion} />
            </RegionPanelTableSection>
          </div>

          {isTemp && <p className="badge-manual">{t('region.manualBadge')}</p>}

          {canEditGeometry ? (
            <div className="region-geometry-block">
              {geometry.shape !== 'cuboid' ? (
                <p className="region-meta-label">{t('region.geometryTitle')}</p>
              ) : null}
              <RegionGeometryEditor
                key={region.id}
                value={geometry}
                onChange={onGeometryChange}
                disabled={saveBusy}
                readOnly={fieldsLocked}
                cuboidTitle={geometry.shape === 'cuboid' ? t('region.geometryTitle') : undefined}
              />
              {geometryError && <p className="flags-manager-error">{geometryError}</p>}
            </div>
          ) : (
            <div className="region-geometry-block">
              {geometry.shape !== 'cuboid' ? (
                <p className="region-meta-label">{t('region.geometryTitle')}</p>
              ) : null}
              <RegionGeometryEditor
                key={region.id}
                value={geometry}
                onChange={() => {}}
                readOnly
                cuboidTitle={geometry.shape === 'cuboid' ? t('region.geometryTitle') : undefined}
              />
              {regionHasNonStandardHeight(region) && (
                <p className="geometry-height-warn" role="status">{t('region.heightWarn')}</p>
              )}
            </div>
          )}

          <div className="partners-block">
            <p className="region-meta-label">
              {t('region.spatialLinks', { count: totalSpatial })}
            </p>

            <div className="partners-subsection">
              <RegionPanelTableSection
                title={
                  <span className="partners-subtitle">
                    {t('region.intersects', { count: sortedSpatial.intersects.length })}
                  </span>
                }
              >
                <IntersectsPartnerTable
                  region={region}
                  partnerIds={sortedSpatial.intersects}
                  spatialEdges={spatialEdges}
                  regionsById={regionsById}
                  emptyText={t('region.noIntersects')}
                  onFocusRegion={navigateToRegion}
                />
              </RegionPanelTableSection>
            </div>

            <div className="partners-subsection">
              <p className="partners-subtitle">
                {t('region.containedIn', { count: sortedSpatial.containedIn.length })}
              </p>
              <p className="partners-hint">{t('region.containedInHint')}</p>
              <PartnerList
                ids={sortedSpatial.containedIn}
                onFocusRegion={navigateToRegion}
              />
            </div>

            <div className="partners-subsection">
              <RegionPanelTableSection
                title={
                  <span className="partners-subtitle">
                    {t('region.contains', { count: sortedSpatial.contains.length })}
                  </span>
                }
                hint={<p className="partners-hint">{t('region.containsHint')}</p>}
              >
                <ContainsPartnerTable
                  ids={sortedSpatial.contains}
                  onFocusRegion={navigateToRegion}
                />
              </RegionPanelTableSection>
            </div>
          </div>

          <RegionMembersEditor
            region={region}
            fieldsLocked={fieldsLocked}
            fieldsEditable={fieldsEditable}
            canEdit={Boolean(onUpdateMembers)}
            ownersPlayers={ownersPlayers}
            ownersUniqueIds={ownersUniqueIds}
            membersPlayers={membersPlayers}
            membersUniqueIds={membersUniqueIds}
            membersError={membersError}
            onOwnersPlayersChange={(next) => {
              setOwnersPlayers(next);
              markMembersDirty();
            }}
            onOwnersUniqueIdsChange={(next) => {
              setOwnersUniqueIds(next);
              markMembersDirty();
            }}
            onMembersPlayersChange={(next) => {
              setMembersPlayers(next);
              markMembersDirty();
            }}
            onMembersUniqueIdsChange={(next) => {
              setMembersUniqueIds(next);
              markMembersDirty();
            }}
            onRequestClearList={(onConfirm) => setPendingMembersClear(() => onConfirm)}
          />

          <RegionFlagsEditor
            regionId={region.id}
            fieldsLocked={fieldsLocked}
            fieldsEditable={fieldsEditable}
            flagRows={flagRows}
            flagsError={flagsError}
            flagsCatalog={flagsCatalog}
            flagsByName={flagsByName}
            regionsById={regionsById}
            spatialConflicts={spatialConflicts}
            isDirty={isDirty}
            canEdit={Boolean(onUpdateFlags)}
            onUpdateFlagRow={updateFlagRow}
            onRemoveFlagRow={removeFlagRow}
            onAddFlagRow={addFlagRow}
            onRequestClearFlags={requestClearFlags}
            onShowFlagOnScheme={onShowFlagOnScheme}
            onShowConflictOnScheme={(c) => {
              if (!onShowConflictOnScheme) return;
              requestLeave(() => onShowConflictOnScheme(c));
            }}
          />

          <RegionEffectiveFlags
            regionId={region.id}
            refreshKey={`${region.priority}|${region.parent ?? ''}|${JSON.stringify(region.flags)}`}
            flagsCatalog={flagsCatalog}
            spatialConflicts={spatialConflicts}
            crossFlagConflicts={crossFlagConflicts}
            focusFlag={effectiveFlagsFocus}
            focusFlagSeq={effectiveFlagsFocusSeq}
            onFocusRegion={onFocusRegion}
            onShowConflictOnScheme={(c) => {
              if (!onShowConflictOnScheme) return;
              requestLeave(() => onShowConflictOnScheme(c));
            }}
          />

          {onDeleteManual && (
            <div className="region-delete-footer modal-actions">
              <button type="button" className="danger" onClick={() => onDeleteManual(region.id)}>
                {t('region.deleteManual')}
              </button>
            </div>
          )}
        </div>
      </div>
    </ModalOverlay>
    {showUnsavedConfirm && (
      <ConfirmDialog
        title={t('dialog.unsavedTitle')}
        message={t('dialog.unsavedConfirm')}
        onCancel={() => {
          setShowUnsavedConfirm(false);
          setPendingLeave(null);
        }}
        onConfirm={() => {
          setShowUnsavedConfirm(false);
          const action = pendingLeave ?? onClose;
          setPendingLeave(null);
          action();
        }}
      />
    )}
    {showDiscardConfirm && (
      <ConfirmDialog
        title={t('dialog.discardTitle')}
        message={t('dialog.discardConfirm')}
        onCancel={() => setShowDiscardConfirm(false)}
        onConfirm={() => {
          discardChanges();
          setShowDiscardConfirm(false);
        }}
      />
    )}
    {showClearFlagsConfirm && (
      <ConfirmDialog
        title={t('region.clearFlagsTitle')}
        message={t('region.clearFlagsConfirm')}
        confirmClass="warning"
        onCancel={() => setShowClearFlagsConfirm(false)}
        onConfirm={() => {
          setShowClearFlagsConfirm(false);
          clearAllFlagRows();
        }}
      />
    )}
    {showAddChildSearch && (
      <SearchPanel
        regionIds={addChildCandidates}
        onClose={() => setShowAddChildSearch(false)}
        onSelect={handleAddChildSelect}
        overlayClassName="modal-overlay--above-region"
      />
    )}
    {pendingChild && onUpdateParent && (
      <ConfirmDialog
        title={t('region.addChild')}
        message={t('region.addChildMoveConfirm', {
          child: pendingChild.id,
          from: pendingChild.moveFrom ?? '—',
          to: region.id,
        })}
        onCancel={() => setPendingChild(null)}
        onConfirm={() => {
          const { id } = pendingChild;
          setPendingChild(null);
          void onUpdateParent(id, region.id).catch((err) => setAddChildError(String(err)));
        }}
      />
    )}
    {pendingMembersClear && (
      <ConfirmDialog
        title={t('region.stringListClearTitle')}
        message={t('region.stringListClearConfirm')}
        confirmClass="warning"
        onCancel={() => setPendingMembersClear(null)}
        onConfirm={() => {
          const action = pendingMembersClear;
          setPendingMembersClear(null);
          action();
        }}
      />
    )}
    </>
  );
}
