import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { FlagInfo, RegionData, SpatialEdge } from '../types';
import type { SpatialRelationsGrouped } from '../utils/graph';
import { compareNatural } from '../utils/naturalSort';
import { isTemporaryRegion } from '../utils/regions';
import { regionHasNonStandardHeight } from '../utils/worldHeight';
import {
  findIntersectOverlapBlocks,
  formatOneDecimal,
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
import { RegionMembersEditor } from './region/RegionMembersEditor';

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
}

type IntersectSortKey = 'id' | 'blocks' | 'percent';
type SortDir = 'asc' | 'desc';

function PartnerList({
  ids,
  emptyText,
  onFocusRegion,
}: {
  ids: string[];
  emptyText?: string;
  onFocusRegion: (id: string) => void;
}) {
  const sorted = useMemo(() => [...ids].sort(compareNatural), [ids]);

  if (sorted.length === 0) {
    if (!emptyText) return null;
    return <p className="partners-empty">{emptyText}</p>;
  }

  return (
    <div className="region-link-table">
      <table>
        <tbody>
          {sorted.map((pid) => (
            <tr key={pid}>
              <td>
                <button type="button" className="region-link" onClick={() => onFocusRegion(pid)}>
                  {pid}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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

  const selfVolume = useMemo(() => regionVolume(region), [region]);

  const rows = useMemo(() => {
    return partnerIds.map((id) => {
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
    });
  }, [partnerIds, spatialEdges, region, regionsById, selfVolume]);

  const sorted = useMemo(() => {
    const list = [...rows];
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
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: IntersectSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'id' ? 'asc' : 'desc');
  };

  const sortMarker = (key: IntersectSortKey) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  if (sorted.length === 0) {
    return <p className="partners-empty">{emptyText}</p>;
  }

  return (
    <div className="region-link-table region-link-table--intersects">
      <table>
        <thead>
          <tr>
            <th>
              <button
                type="button"
                className="region-sort-btn"
                onClick={() => toggleSort('id')}
                title={sortDir === 'asc' ? t('region.intersectSortAsc') : t('region.intersectSortDesc')}
              >
                {t('region.intersectColRegion')}
                {sortMarker('id')}
              </button>
            </th>
            <th className="region-num-col">
              <button
                type="button"
                className="region-sort-btn"
                onClick={() => toggleSort('blocks')}
                title={sortDir === 'asc' ? t('region.intersectSortAsc') : t('region.intersectSortDesc')}
              >
                {t('region.intersectColBlocks')}
                {sortMarker('blocks')}
              </button>
            </th>
            <th className="region-num-col">
              <button
                type="button"
                className="region-sort-btn"
                onClick={() => toggleSort('percent')}
                title={sortDir === 'asc' ? t('region.intersectSortAsc') : t('region.intersectSortDesc')}
              >
                {t('region.intersectColPercent')}
                {sortMarker('percent')}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.id}>
              <td>
                <button type="button" className="region-link" onClick={() => onFocusRegion(row.id)}>
                  {row.id}
                </button>
              </td>
              <td className="region-num-col">
                {row.blocks == null ? '—' : formatOneDecimal(row.blocks)}
              </td>
              <td className="region-num-col">
                {row.percent == null ? '—' : `${formatOneDecimal(row.percent)}%`}
              </td>
            </tr>
          ))}
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
  const [showCopiedFlash, setShowCopiedFlash] = useState(false);
  const [copiedFlashPos, setCopiedFlashPos] = useState<{ left: number; top: number } | null>(null);
  const copiedFlashTimerRef = useRef<number | null>(null);
  const copyBtnRef = useRef<HTMLButtonElement>(null);
  const [pendingLeave, setPendingLeave] = useState<null | (() => void)>(null);

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

  const copyName = () => {
    void navigator.clipboard.writeText(region.id);
    const btn = copyBtnRef.current;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setCopiedFlashPos({
        left: rect.left + rect.width / 2,
        top: rect.top - 6,
      });
    } else {
      setCopiedFlashPos(null);
    }
    setShowCopiedFlash(true);
    if (copiedFlashTimerRef.current != null) {
      window.clearTimeout(copiedFlashTimerRef.current);
    }
    copiedFlashTimerRef.current = window.setTimeout(() => {
      setShowCopiedFlash(false);
      setCopiedFlashPos(null);
      copiedFlashTimerRef.current = null;
    }, 2000);
  };

  useEffect(() => () => {
    if (copiedFlashTimerRef.current != null) {
      window.clearTimeout(copiedFlashTimerRef.current);
    }
  }, []);

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
          copiedFlashPos={copiedFlashPos}
          showCopiedFlash={showCopiedFlash}
          copyBtnRef={copyBtnRef}
          onHistoryBack={requestHistoryBack}
          onHistoryForward={requestHistoryForward}
          onRequestRename={onRequestRename}
          onCopyName={copyName}
          onToggleLock={() => setFieldsLocked((v) => {
            if (!v) setEditingParent(false);
            return !v;
          })}
          onDiscard={requestDiscard}
          onSave={() => { void saveAll(); }}
          onClose={requestClose}
        />

        <div className="modal-body">
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
              {onUpdatePriority && !fieldsLocked ? (
                <input
                  className="search-input region-priority-input"
                  type="number"
                  step={1}
                  value={priorityDraft}
                  disabled={!fieldsEditable}
                  onChange={(e) => {
                    setPriorityDraft(e.target.value);
                    setPriorityError(null);
                  }}
                />
              ) : (
                priorityDraft.trim() || region.priority
              )}
            </p>
            {priorityError && <p className="flags-manager-error">{priorityError}</p>}
          </div>

          <div className="region-depth-block">
            <p>
              <strong>{t('region.nestingLevel')}:</strong>{' '}
              {hierarchyDepth}
            </p>
          </div>

          <div className="partners-block children-block">
            <p className="region-meta-label">
              {t('region.children', { count: sortedChildIds.length })}
            </p>
            <PartnerList
              ids={sortedChildIds}
              emptyText={t('region.noChildren')}
              onFocusRegion={navigateToRegion}
            />
          </div>

          {isTemp && <p className="badge-manual">{t('region.manualBadge')}</p>}

          {canEditGeometry ? (
            <div className="region-geometry-block">
              <p className="region-meta-label">{t('region.geometryTitle')}</p>
              <RegionGeometryEditor
                key={region.id}
                value={geometry}
                onChange={onGeometryChange}
                disabled={saveBusy}
                readOnly={fieldsLocked}
              />
              {geometryError && <p className="flags-manager-error">{geometryError}</p>}
            </div>
          ) : (
            <>
              {region.min && region.max && (
                <p>
                  <strong>{t('region.coords')}:</strong>{' '}
                  {t('region.coordsMin')} ({region.min.x}, {region.min.y}, {region.min.z}) —
                  {t('region.coordsMax')} ({region.max.x}, {region.max.y}, {region.max.z})
                </p>
              )}
              {region.points && (
                <p>
                  <strong>{t('region.poly2dPoints')}:</strong> {region.points.length}, Y: {region.min_y}–{region.max_y}
                </p>
              )}
              {regionHasNonStandardHeight(region) && (
                <p className="geometry-height-warn" role="status">{t('region.heightWarn')}</p>
              )}
            </>
          )}

          <div className="partners-block">
            <p className="region-meta-label">
              {t('region.spatialLinks', { count: totalSpatial })}
            </p>

            <div className="partners-subsection">
              <p className="partners-subtitle">
                {t('region.intersects', { count: sortedSpatial.intersects.length })}
              </p>
              <IntersectsPartnerTable
                region={region}
                partnerIds={sortedSpatial.intersects}
                spatialEdges={spatialEdges}
                regionsById={regionsById}
                emptyText={t('region.noIntersects')}
                onFocusRegion={navigateToRegion}
              />
            </div>

            <div className="partners-subsection">
              <p className="partners-subtitle">
                {t('region.containedIn', { count: sortedSpatial.containedIn.length })}
              </p>
              <p className="partners-hint">{t('region.containedInHint')}</p>
              <PartnerList
                ids={sortedSpatial.containedIn}
                emptyText=""
                onFocusRegion={navigateToRegion}
              />
            </div>

            <div className="partners-subsection">
              <p className="partners-subtitle">
                {t('region.contains', { count: sortedSpatial.contains.length })}
              </p>
              <p className="partners-hint">{t('region.containsHint')}</p>
              <PartnerList
                ids={sortedSpatial.contains}
                emptyText=""
                onFocusRegion={navigateToRegion}
              />
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
          />

          <RegionFlagsEditor
            fieldsLocked={fieldsLocked}
            fieldsEditable={fieldsEditable}
            flagRows={flagRows}
            flagsError={flagsError}
            flagsCatalog={flagsCatalog}
            flagsByName={flagsByName}
            isDirty={isDirty}
            canEdit={Boolean(onUpdateFlags)}
            onUpdateFlagRow={updateFlagRow}
            onRemoveFlagRow={removeFlagRow}
            onAddFlagRow={addFlagRow}
            onRequestClearFlags={requestClearFlags}
            onShowFlagOnScheme={onShowFlagOnScheme}
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
    </>
  );
}
