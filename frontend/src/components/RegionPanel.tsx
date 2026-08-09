import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/I18nContext';
import type { FlagInfo, RegionData, SpatialEdge } from '../types';
import type { SpatialRelationsGrouped } from '../utils/graph';
import { compareNatural } from '../utils/naturalSort';
import { validateFlagRows } from '../utils/flagRows';
import { isTemporaryRegion } from '../utils/regions';
import { regionHasNonStandardHeight } from '../utils/worldHeight';
import {
  findIntersectOverlapBlocks,
  formatOneDecimal,
  intersectionVolume,
  regionVolume,
} from '../utils/volume';
import { findFlagInfo, FlagNameWithHelp } from './FlagHelpButton';
import { FlagNameCombobox } from './FlagNameCombobox';
import { FlagValueInput } from './FlagValueInput';
import { IconLock, IconUnlock } from './GraphControlIcons';
import { ModalOverlay } from './ModalOverlay';
import { ConfirmDialog } from './ConfirmDialog';
import { SuggestDropdown } from './SuggestDropdown';
import {
  geometryFromRegion,
  RegionGeometryEditor,
  type GeometryPayload,
  type RegionGeometryState,
  validateGeometryState,
} from './RegionGeometryEditor';

interface FlagRow {
  key: string;
  name: string;
  value: string;
}

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

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="5" y="5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="2" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function formatFlagValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function parseFlagValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}

function flagsToRows(flags: Record<string, unknown>): FlagRow[] {
  return Object.entries(flags).map(([name, value], index) => ({
    key: `${name}-${index}`,
    name,
    value: formatFlagValue(value),
  }));
}

function rowsToFlags(rows: FlagRow[]): Record<string, unknown> {
  const flags: Record<string, unknown> = {};
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) continue;
    flags[name] = parseFlagValue(row.value);
  }
  return flags;
}

function stringListFromParty(party: Record<string, unknown> | undefined, key: string): string[] {
  const raw = party?.[key];
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v));
}

function partyFromRegion(party: Record<string, unknown> | undefined): {
  players: string[];
  uniqueIds: string[];
} {
  return {
    players: stringListFromParty(party, 'players'),
    uniqueIds: stringListFromParty(party, 'unique-ids'),
  };
}

function partyToRecord(
  players: string[],
  uniqueIds: string[],
  base?: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(base ?? {}) };
  out.players = players.map((s) => s.trim()).filter(Boolean);
  out['unique-ids'] = uniqueIds.map((s) => s.trim()).filter(Boolean);
  return out;
}

function StringListEditor({
  label,
  values,
  onChange,
  disabled,
  readOnly,
  addLabel,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  readOnly?: boolean;
  addLabel: string;
}) {
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
              <tr key={index}>
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
                    title="×"
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
}: RegionPanelProps) {
  const { t } = useI18n();
  const [fieldsLocked, setFieldsLocked] = useState(true);
  const [editingParent, setEditingParent] = useState(false);
  const [parentQuery, setParentQuery] = useState(region.parent ?? '');
  const [parentError, setParentError] = useState<string | null>(null);

  const isTemp = isTemporaryRegion(region);
  const canEditGeometry = Boolean(onUpdateGeometry) && (isTemp || region.type !== 'global');

  const [geometry, setGeometry] = useState<RegionGeometryState>(() => geometryFromRegion(region));
  const [geometryError, setGeometryError] = useState<string | null>(null);
  const [geometryDirty, setGeometryDirty] = useState(false);

  const [flagRows, setFlagRows] = useState<FlagRow[]>(() => flagsToRows(region.flags ?? {}));
  const [flagsDirty, setFlagsDirty] = useState(false);
  const [flagsError, setFlagsError] = useState<string | null>(null);

  const [priorityDraft, setPriorityDraft] = useState(String(region.priority));
  const [priorityError, setPriorityError] = useState<string | null>(null);

  const [ownersPlayers, setOwnersPlayers] = useState(() => partyFromRegion(region.owners).players);
  const [ownersUniqueIds, setOwnersUniqueIds] = useState(() => partyFromRegion(region.owners).uniqueIds);
  const [membersPlayers, setMembersPlayers] = useState(() => partyFromRegion(region.members).players);
  const [membersUniqueIds, setMembersUniqueIds] = useState(() => partyFromRegion(region.members).uniqueIds);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [membersDirty, setMembersDirty] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showClearFlagsConfirm, setShowClearFlagsConfirm] = useState(false);
  const [showCopiedFlash, setShowCopiedFlash] = useState(false);
  const [copiedFlashPos, setCopiedFlashPos] = useState<{ left: number; top: number } | null>(null);
  const copiedFlashTimerRef = useRef<number | null>(null);
  const copyBtnRef = useRef<HTMLButtonElement>(null);
  const [pendingLeave, setPendingLeave] = useState<null | (() => void)>(null);

  const resetDraftsFromRegion = (source: RegionData) => {
    setGeometry(geometryFromRegion(source));
    setGeometryDirty(false);
    setGeometryError(null);
    setFlagRows(flagsToRows(source.flags ?? {}));
    setFlagsDirty(false);
    setFlagsError(null);
    setParentQuery(source.parent ?? '');
    setParentError(null);
    setEditingParent(false);
    setPriorityDraft(String(source.priority));
    setPriorityError(null);
    const owners = partyFromRegion(source.owners);
    const members = partyFromRegion(source.members);
    setOwnersPlayers(owners.players);
    setOwnersUniqueIds(owners.uniqueIds);
    setMembersPlayers(members.players);
    setMembersUniqueIds(members.uniqueIds);
    setMembersDirty(false);
    setMembersError(null);
  };

  useEffect(() => {
    resetDraftsFromRegion(region);
    setFieldsLocked(true);
  }, [region]);

  const parentCandidates = useMemo(() => {
    const q = parentQuery.trim().toLowerCase();
    const excluded = new Set([region.id, ...childIds]);
    return regionIds
      .filter((id) => !excluded.has(id))
      .filter((id) => !q || id.toLowerCase().includes(q))
      .sort(compareNatural)
      .slice(0, 40);
  }, [parentQuery, regionIds, region.id, childIds]);

  const resolvedParent = useMemo(() => {
    const q = parentQuery.trim();
    if (!q) return null;
    return regionIds.find((id) => id.toLowerCase() === q.toLowerCase() && id !== region.id) ?? undefined;
  }, [parentQuery, regionIds, region.id]);

  const parentDirty = useMemo(() => {
    if (!onUpdateParent) return false;
    const draft = parentQuery.trim() || null;
    const current = region.parent ?? null;
    if (draft === null && current === null) return false;
    if (draft === null || current === null) return true;
    return draft.toLowerCase() !== current.toLowerCase();
  }, [onUpdateParent, parentQuery, region.parent]);

  const priorityDirty =
    Boolean(onUpdatePriority) && priorityDraft.trim() !== String(region.priority);

  const sortedChildIds = useMemo(() => [...childIds].sort(compareNatural), [childIds]);

  const sortedSpatial = useMemo(() => ({
    intersects: [...spatialRelations.intersects].sort(compareNatural),
    containedIn: [...spatialRelations.containedIn].sort(compareNatural),
    contains: [...spatialRelations.contains].sort(compareNatural),
  }), [spatialRelations]);

  const isDirty =
    geometryDirty
    || flagsDirty
    || parentDirty
    || priorityDirty
    || membersDirty;

  const fieldsEditable = !fieldsLocked && !saveBusy;

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

  const onGeometryChange = (next: RegionGeometryState) => {
    setGeometry(next);
    setGeometryDirty(true);
    setGeometryError(null);
  };

  const updateFlagRow = (key: string, patch: Partial<Pick<FlagRow, 'name' | 'value'>>) => {
    setFlagRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setFlagsDirty(true);
  };

  const removeFlagRow = (key: string) => {
    setFlagRows((prev) => prev.filter((row) => row.key !== key));
    setFlagsDirty(true);
  };

  const addFlagRow = () => {
    setFlagRows((prev) => [
      ...prev,
      { key: `new-${Date.now()}-${prev.length}`, name: '', value: '' },
    ]);
    setFlagsDirty(true);
  };

  const clearAllFlagRows = () => {
    if (flagRows.length === 0) return;
    setFlagRows([]);
    setFlagsDirty(true);
    setFlagsError(null);
  };

  const requestClearFlags = () => {
    if (!fieldsEditable || flagRows.length === 0) return;
    setShowClearFlagsConfirm(true);
  };

  const markMembersDirty = () => setMembersDirty(true);

  const discardChanges = () => {
    resetDraftsFromRegion(region);
    setFieldsLocked(true);
    setShowDiscardConfirm(false);
  };

  const requestDiscard = () => {
    if (!isDirty || saveBusy) return;
    setShowDiscardConfirm(true);
  };

  const saveAll = async () => {
    if (!isDirty || saveBusy) return;

    setParentError(null);
    setPriorityError(null);
    setGeometryError(null);
    setFlagsError(null);
    setMembersError(null);

    if (parentDirty) {
      if (parentQuery.trim() !== '' && resolvedParent === undefined) {
        setParentError(t('region.parentInvalid'));
        return;
      }
    }

    let priorityValue: number | null = null;
    if (priorityDirty) {
      const parsed = Number(priorityDraft.trim());
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
        setPriorityError(t('geometry.invalidNumber'));
        return;
      }
      priorityValue = parsed;
    }

    let geometryPayload: GeometryPayload | null = null;
    if (geometryDirty && onUpdateGeometry) {
      const validated = validateGeometryState(geometry);
      if (!validated.ok) {
        setGeometryError(t(validated.errorKey));
        return;
      }
      geometryPayload = validated.payload;
    }

    if (flagsDirty && onUpdateFlags) {
      const flagCheck = validateFlagRows(flagRows, flagsCatalog);
      if (!flagCheck.ok) {
        setFlagsError(t(flagCheck.errorKey));
        return;
      }
    }

    setSaveBusy(true);
    try {
      if (parentDirty && onUpdateParent) {
        await onUpdateParent(region.id, parentQuery.trim() ? resolvedParent! : null);
      }
      if (priorityDirty && onUpdatePriority && priorityValue != null) {
        await onUpdatePriority(region.id, priorityValue);
      }
      if (geometryPayload && onUpdateGeometry) {
        await onUpdateGeometry(region.id, geometryPayload);
        setGeometryDirty(false);
      }
      if (flagsDirty && onUpdateFlags) {
        await onUpdateFlags(region.id, rowsToFlags(flagRows));
        setFlagsDirty(false);
      }
      if (membersDirty && onUpdateMembers) {
        await onUpdateMembers(
          region.id,
          partyToRecord(ownersPlayers, ownersUniqueIds, region.owners),
          partyToRecord(membersPlayers, membersUniqueIds, region.members),
        );
        setMembersDirty(false);
      }
      setFieldsLocked(true);
    } catch (err) {
      const message = String(err);
      if (parentDirty) setParentError(message);
      else if (priorityDirty) setPriorityError(message);
      else if (geometryDirty) setGeometryError(message);
      else if (flagsDirty) setFlagsError(message);
      else setMembersError(message);
    } finally {
      setSaveBusy(false);
    }
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
        <header className="region-panel-header">
          <div className="region-panel-title">
            <div className="region-history-nav">
              <button
                type="button"
                className="icon-btn"
                disabled={!canGoBack}
                title={t('region.historyBack')}
                aria-label={t('region.historyBack')}
                onClick={requestHistoryBack}
              >
                ←
              </button>
              <button
                type="button"
                className="icon-btn"
                disabled={!canGoForward}
                title={t('region.historyForward')}
                aria-label={t('region.historyForward')}
                onClick={requestHistoryForward}
              >
                →
              </button>
            </div>
            <h2>{region.id}</h2>
            {onRequestRename && (
              <button type="button" onClick={() => onRequestRename(region.id)}>
                {t('region.editName')}
              </button>
            )}
            <span className="copy-name-wrap">
              <button
                ref={copyBtnRef}
                type="button"
                className="icon-btn"
                title={t('region.copyName')}
                aria-label={t('region.copyName')}
                onClick={copyName}
              >
                <CopyIcon />
              </button>
            </span>
            {showCopiedFlash && copiedFlashPos && createPortal(
              <span
                className="copy-name-flash"
                role="status"
                style={{ left: copiedFlashPos.left, top: copiedFlashPos.top }}
              >
                {t('region.copiedFlash')}
              </span>,
              document.body,
            )}
            <button
              type="button"
              className={`icon-btn region-fields-lock${fieldsLocked ? ' is-locked' : ' is-unlocked'}`}
              title={t(fieldsLocked ? 'region.unlockFields' : 'region.lockFields')}
              aria-label={t(fieldsLocked ? 'region.unlockFields' : 'region.lockFields')}
              disabled={saveBusy}
              onClick={() => setFieldsLocked((v) => {
                if (!v) setEditingParent(false);
                return !v;
              })}
            >
              {fieldsLocked ? <IconLock /> : <IconUnlock />}
            </button>
          </div>
          <div className="region-panel-header-actions">
            <button
              type="button"
              className="region-action-btn"
              disabled={!isDirty || saveBusy}
              onClick={requestDiscard}
            >
              {t('region.cancelChanges')}
            </button>
            <button
              type="button"
              className="region-action-btn success"
              disabled={!isDirty || saveBusy}
              onClick={() => void saveAll()}
            >
              {saveBusy ? t('region.savingAll') : t('region.saveAll')}
            </button>
            <button type="button" onClick={requestClose}>×</button>
          </div>
        </header>

        <div className="modal-body">
          <div className="region-parent-block">
            {fieldsLocked || !onUpdateParent || !editingParent ? (
              <p>
                <strong>{t('region.parent')}:</strong>{' '}
                {lockedParentLabel == null ? (
                  '—'
                ) : lockedParentNavId ? (
                  <button
                    type="button"
                    className="region-link"
                    onClick={() => navigateToRegion(lockedParentNavId)}
                  >
                    {lockedParentLabel}
                  </button>
                ) : (
                  <span>{lockedParentLabel}</span>
                )}
                {!fieldsLocked && onUpdateParent && (
                  <button
                    type="button"
                    className="region-action-btn"
                    disabled={!fieldsEditable}
                    onClick={() => {
                      setParentQuery(region.parent ?? '');
                      setParentError(null);
                      setEditingParent(true);
                    }}
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
                  onChange={(e) => {
                    setParentQuery(e.target.value);
                    setParentError(null);
                  }}
                  disabled={!fieldsEditable}
                />
                {parentQuery.trim() && resolvedParent === undefined && (
                  <p className="search-empty">{t('region.parentInvalid')}</p>
                )}
                <SuggestDropdown
                  items={parentCandidates}
                  query={parentQuery}
                  open={fieldsEditable && parentCandidates.length > 0}
                  onPick={setParentQuery}
                />
                <div className="modal-actions">
                  <button
                    type="button"
                    disabled={!fieldsEditable || !parentQuery.trim()}
                    onClick={() => {
                      setParentQuery('');
                      setParentError(null);
                    }}
                  >
                    {t('region.clearParent')}
                  </button>
                </div>
              </div>
            )}
            {parentError && <p className="flags-manager-error">{parentError}</p>}
          </div>

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

          <div className="region-members-block">
            <p className="region-meta-label">{t('region.owners')}</p>
            {onUpdateMembers ? (
              <>
                <StringListEditor
                  label={t('region.players')}
                  values={ownersPlayers}
                  disabled={!fieldsEditable}
                  readOnly={fieldsLocked}
                  addLabel={`+ ${t('region.players')}`}
                  onChange={(next) => {
                    setOwnersPlayers(next);
                    markMembersDirty();
                  }}
                />
                <StringListEditor
                  label={t('region.uniqueIds')}
                  values={ownersUniqueIds}
                  disabled={!fieldsEditable}
                  readOnly={fieldsLocked}
                  addLabel={`+ ${t('region.uniqueIds')}`}
                  onChange={(next) => {
                    setOwnersUniqueIds(next);
                    markMembersDirty();
                  }}
                />
              </>
            ) : (
              <pre className="region-members-readonly">{JSON.stringify(region.owners ?? {}, null, 2)}</pre>
            )}

            <p className="region-meta-label">{t('region.members')}</p>
            {onUpdateMembers ? (
              <>
                <StringListEditor
                  label={t('region.players')}
                  values={membersPlayers}
                  disabled={!fieldsEditable}
                  readOnly={fieldsLocked}
                  addLabel={`+ ${t('region.players')}`}
                  onChange={(next) => {
                    setMembersPlayers(next);
                    markMembersDirty();
                  }}
                />
                <StringListEditor
                  label={t('region.uniqueIds')}
                  values={membersUniqueIds}
                  disabled={!fieldsEditable}
                  readOnly={fieldsLocked}
                  addLabel={`+ ${t('region.uniqueIds')}`}
                  onChange={(next) => {
                    setMembersUniqueIds(next);
                    markMembersDirty();
                  }}
                />
                {membersError && <p className="flags-manager-error">{membersError}</p>}
              </>
            ) : (
              <pre className="region-members-readonly">{JSON.stringify(region.members ?? {}, null, 2)}</pre>
            )}
          </div>

          <div className="flags-table-wrap">
            <p><strong>{t('region.flags')}</strong></p>
            {onUpdateFlags && !fieldsLocked ? (
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
                              onChange={(name) => updateFlagRow(row.key, { name })}
                              placeholder={t('flagsManager.namePlaceholder')}
                              onShowOnScheme={onShowFlagOnScheme}
                              unsavedChanges={isDirty}
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
                              disabled={!fieldsEditable}
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
                  <button type="button" disabled={!fieldsEditable} onClick={addFlagRow}>
                    {t('flagsManager.add')}
                  </button>
                  <button
                    type="button"
                    className="warning"
                    disabled={!fieldsEditable || flagRows.length === 0}
                    onClick={requestClearFlags}
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
                    const info = flagsCatalog.find((f) => f.name === row.name);
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
        onConfirm={discardChanges}
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
