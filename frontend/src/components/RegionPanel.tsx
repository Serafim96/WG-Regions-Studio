import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { FlagInfo, RegionData } from '../types';
import type { SpatialRelationsGrouped } from '../utils/graph';
import { compareNatural } from '../utils/naturalSort';
import { validateFlagRows } from '../utils/flagRows';
import { isTemporaryRegion } from '../utils/regions';
import { findFlagInfo } from './FlagHelpButton';
import { FlagNameCombobox } from './FlagNameCombobox';
import { FlagValueInput } from './FlagValueInput';
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
  flagsCatalog: FlagInfo[];
  regionIds: string[];
  onClose: () => void;
  onFocusRegion: (regionId: string) => void;
  onCopyName?: (regionId: string) => void;
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
}

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
  addLabel,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  addLabel: string;
}) {
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
  flagsCatalog,
  regionIds,
  onClose,
  onFocusRegion,
  onCopyName,
  onDeleteManual,
  onUpdateParent,
  onUpdateFlags,
  onUpdateGeometry,
  onRequestRename,
  onUpdatePriority,
  onUpdateMembers,
}: RegionPanelProps) {
  const { t } = useI18n();
  const [editingParent, setEditingParent] = useState(false);
  const [parentQuery, setParentQuery] = useState(region.parent ?? '');
  const [parentBusy, setParentBusy] = useState(false);
  const [parentError, setParentError] = useState<string | null>(null);

  const isTemp = isTemporaryRegion(region);
  const canEditGeometry = Boolean(onUpdateGeometry) && (isTemp || region.type !== 'global');

  const [geometry, setGeometry] = useState<RegionGeometryState>(() => geometryFromRegion(region));
  const [geometryBusy, setGeometryBusy] = useState(false);
  const [geometryError, setGeometryError] = useState<string | null>(null);
  const [geometryDirty, setGeometryDirty] = useState(false);

  const [flagRows, setFlagRows] = useState<FlagRow[]>(() => flagsToRows(region.flags ?? {}));
  const [flagsDirty, setFlagsDirty] = useState(false);
  const [flagsBusy, setFlagsBusy] = useState(false);
  const [flagsError, setFlagsError] = useState<string | null>(null);

  const [priorityDraft, setPriorityDraft] = useState(String(region.priority));
  const [priorityBusy, setPriorityBusy] = useState(false);
  const [priorityError, setPriorityError] = useState<string | null>(null);

  const [ownersPlayers, setOwnersPlayers] = useState(() => partyFromRegion(region.owners).players);
  const [ownersUniqueIds, setOwnersUniqueIds] = useState(() => partyFromRegion(region.owners).uniqueIds);
  const [membersPlayers, setMembersPlayers] = useState(() => partyFromRegion(region.members).players);
  const [membersUniqueIds, setMembersUniqueIds] = useState(() => partyFromRegion(region.members).uniqueIds);
  const [membersBusy, setMembersBusy] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [membersDirty, setMembersDirty] = useState(false);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  useEffect(() => {
    setGeometry(geometryFromRegion(region));
    setGeometryDirty(false);
    setGeometryError(null);
    setFlagRows(flagsToRows(region.flags ?? {}));
    setFlagsDirty(false);
    setFlagsError(null);
    setParentQuery(region.parent ?? '');
    setEditingParent(false);
    setParentError(null);
    setPriorityDraft(String(region.priority));
    setPriorityError(null);
    const owners = partyFromRegion(region.owners);
    const members = partyFromRegion(region.members);
    setOwnersPlayers(owners.players);
    setOwnersUniqueIds(owners.uniqueIds);
    setMembersPlayers(members.players);
    setMembersUniqueIds(members.uniqueIds);
    setMembersDirty(false);
    setMembersError(null);
  }, [region]);

  const priorityDirty =
    Boolean(onUpdatePriority) && priorityDraft.trim() !== String(region.priority);

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

  const sortedChildIds = useMemo(() => [...childIds].sort(compareNatural), [childIds]);

  const sortedSpatial = useMemo(() => ({
    intersects: [...spatialRelations.intersects].sort(compareNatural),
    containedIn: [...spatialRelations.containedIn].sort(compareNatural),
    contains: [...spatialRelations.contains].sort(compareNatural),
  }), [spatialRelations]);

  const isDirty =
    geometryDirty
    || flagsDirty
    || editingParent
    || priorityDirty
    || membersDirty;

  const requestClose = () => {
    if (isDirty) {
      setShowUnsavedConfirm(true);
      return;
    }
    onClose();
  };

  const copyName = () => {
    if (onCopyName) onCopyName(region.id);
    else navigator.clipboard.writeText(region.id);
  };

  const startEditParent = () => {
    setParentQuery(region.parent ?? '');
    setParentError(null);
    setEditingParent(true);
  };

  const cancelEditParent = () => {
    setEditingParent(false);
    setParentError(null);
    setParentQuery(region.parent ?? '');
  };

  const saveParent = async (next: string | null) => {
    if (!onUpdateParent) return;
    setParentBusy(true);
    setParentError(null);
    try {
      await onUpdateParent(region.id, next);
      setEditingParent(false);
    } catch (err) {
      setParentError(String(err));
    } finally {
      setParentBusy(false);
    }
  };

  const savePriority = async () => {
    if (!onUpdatePriority) return;
    const parsed = Number(priorityDraft.trim());
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      setPriorityError(t('geometry.invalidNumber'));
      return;
    }
    setPriorityBusy(true);
    setPriorityError(null);
    try {
      await onUpdatePriority(region.id, parsed);
    } catch (err) {
      setPriorityError(String(err));
    } finally {
      setPriorityBusy(false);
    }
  };

  const onGeometryChange = (next: RegionGeometryState) => {
    setGeometry(next);
    setGeometryDirty(true);
    setGeometryError(null);
  };

  const saveGeometry = async () => {
    if (!onUpdateGeometry) return;
    const validated = validateGeometryState(geometry);
    if (!validated.ok) {
      setGeometryError(t(validated.errorKey));
      return;
    }
    setGeometryBusy(true);
    setGeometryError(null);
    try {
      await onUpdateGeometry(region.id, validated.payload);
      setGeometryDirty(false);
    } catch (err) {
      setGeometryError(String(err));
    } finally {
      setGeometryBusy(false);
    }
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

  const saveFlags = async () => {
    if (!onUpdateFlags) return;
    const flagCheck = validateFlagRows(flagRows, flagsCatalog);
    if (!flagCheck.ok) {
      setFlagsError(t(flagCheck.errorKey));
      return;
    }
    setFlagsBusy(true);
    setFlagsError(null);
    try {
      await onUpdateFlags(region.id, rowsToFlags(flagRows));
      setFlagsDirty(false);
    } catch (err) {
      setFlagsError(String(err));
    } finally {
      setFlagsBusy(false);
    }
  };

  const markMembersDirty = () => setMembersDirty(true);

  const saveMembers = async () => {
    if (!onUpdateMembers) return;
    setMembersBusy(true);
    setMembersError(null);
    try {
      await onUpdateMembers(
        region.id,
        partyToRecord(ownersPlayers, ownersUniqueIds, region.owners),
        partyToRecord(membersPlayers, membersUniqueIds, region.members),
      );
      setMembersDirty(false);
    } catch (err) {
      setMembersError(String(err));
    } finally {
      setMembersBusy(false);
    }
  };

  const totalSpatial =
    sortedSpatial.intersects.length
    + sortedSpatial.containedIn.length
    + sortedSpatial.contains.length;

  return (
    <>
    <ModalOverlay onClose={requestClose}>
      <div className="modal region-panel-modal" onClick={(e) => e.stopPropagation()}>
        <header className="region-panel-header">
          <div className="region-panel-title">
            <h2>{region.id}</h2>
            {onRequestRename && (
              <button type="button" onClick={() => onRequestRename(region.id)}>
                {t('region.editName')}
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              title={t('region.copyName')}
              aria-label={t('region.copyName')}
              onClick={copyName}
            >
              <CopyIcon />
            </button>
          </div>
          <button type="button" onClick={requestClose}>×</button>
        </header>

        <div className="modal-body">
          <div className="region-parent-block">
            <p>
              <strong>{t('region.parent')}:</strong>{' '}
              {!editingParent && (
                <>
                  {region.parent ? (
                    <button type="button" className="region-link" onClick={() => onFocusRegion(region.parent!)}>
                      {region.parent}
                    </button>
                  ) : (
                    '—'
                  )}
                  {onUpdateParent && (
                    <button type="button" className="inline-toggle-btn" onClick={startEditParent}>
                      {t('region.editParent')}
                    </button>
                  )}
                </>
              )}
            </p>
            {editingParent && onUpdateParent && (
              <div className="region-parent-edit">
                <input
                  className="search-input"
                  type="text"
                  placeholder={t('region.parentPlaceholder')}
                  value={parentQuery}
                  onChange={(e) => setParentQuery(e.target.value)}
                  disabled={parentBusy}
                />
                {parentQuery.trim() && resolvedParent === undefined && (
                  <p className="search-empty">{t('region.parentInvalid')}</p>
                )}
                <SuggestDropdown
                  items={parentCandidates}
                  query={parentQuery}
                  open={parentCandidates.length > 0}
                  onPick={setParentQuery}
                />
                {parentError && <p className="flags-manager-error">{parentError}</p>}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="success"
                    disabled={parentBusy || (parentQuery.trim() !== '' && resolvedParent === undefined)}
                    onClick={() => void saveParent(parentQuery.trim() ? resolvedParent! : null)}
                  >
                    {t('region.saveParent')}
                  </button>
                  <button
                    type="button"
                    disabled={parentBusy || !region.parent}
                    onClick={() => void saveParent(null)}
                  >
                    {t('region.clearParent')}
                  </button>
                  <button type="button" disabled={parentBusy} onClick={cancelEditParent}>
                    {t('region.cancelParent')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="region-priority-block">
            <p>
              <strong>{t('region.priority')}:</strong>{' '}
              {onUpdatePriority ? (
                <>
                  <input
                    className="search-input region-priority-input"
                    type="number"
                    step={1}
                    value={priorityDraft}
                    disabled={priorityBusy}
                    onChange={(e) => {
                      setPriorityDraft(e.target.value);
                      setPriorityError(null);
                    }}
                  />
                  <span className="region-priority-actions">
                    <button
                      type="button"
                      className="success"
                      disabled={priorityBusy || !priorityDirty}
                      onClick={() => void savePriority()}
                    >
                      {t('region.savePriority')}
                    </button>
                    {priorityDirty && (
                      <button
                        type="button"
                        disabled={priorityBusy}
                        onClick={() => {
                          setPriorityDraft(String(region.priority));
                          setPriorityError(null);
                        }}
                      >
                        {t('region.resetPriority')}
                      </button>
                    )}
                  </span>
                </>
              ) : (
                region.priority
              )}
            </p>
            {priorityError && <p className="flags-manager-error">{priorityError}</p>}
          </div>

          <div className="partners-block children-block">
            <p className="region-meta-label">
              {t('region.children', { count: sortedChildIds.length })}
            </p>
            <PartnerList
              ids={sortedChildIds}
              emptyText={t('region.noChildren')}
              onFocusRegion={onFocusRegion}
            />
          </div>

          {isTemp && <p className="badge-manual">{t('region.manualBadge')}</p>}

          {canEditGeometry ? (
            <div className="region-geometry-block">
              <p className="region-meta-label">{t('region.geometryTitle')}</p>
              <RegionGeometryEditor
                value={geometry}
                onChange={onGeometryChange}
                disabled={geometryBusy}
              />
              {geometryError && <p className="flags-manager-error">{geometryError}</p>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="success"
                  disabled={geometryBusy || !geometryDirty}
                  onClick={() => void saveGeometry()}
                >
                  {geometryBusy ? t('region.savingGeometry') : t('region.saveGeometry')}
                </button>
              </div>
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
              <PartnerList
                ids={sortedSpatial.intersects}
                emptyText={t('region.noIntersects')}
                onFocusRegion={onFocusRegion}
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
                onFocusRegion={onFocusRegion}
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
                onFocusRegion={onFocusRegion}
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
                  disabled={membersBusy}
                  addLabel={`+ ${t('region.players')}`}
                  onChange={(next) => {
                    setOwnersPlayers(next);
                    markMembersDirty();
                  }}
                />
                <StringListEditor
                  label={t('region.uniqueIds')}
                  values={ownersUniqueIds}
                  disabled={membersBusy}
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
                  disabled={membersBusy}
                  addLabel={`+ ${t('region.players')}`}
                  onChange={(next) => {
                    setMembersPlayers(next);
                    markMembersDirty();
                  }}
                />
                <StringListEditor
                  label={t('region.uniqueIds')}
                  values={membersUniqueIds}
                  disabled={membersBusy}
                  addLabel={`+ ${t('region.uniqueIds')}`}
                  onChange={(next) => {
                    setMembersUniqueIds(next);
                    markMembersDirty();
                  }}
                />
                {membersError && <p className="flags-manager-error">{membersError}</p>}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="success"
                    disabled={membersBusy || !membersDirty}
                    onClick={() => void saveMembers()}
                  >
                    {t('region.saveMembers')}
                  </button>
                </div>
              </>
            ) : (
              <pre className="region-members-readonly">{JSON.stringify(region.members ?? {}, null, 2)}</pre>
            )}
          </div>

          <div className="flags-table-wrap">
            <p><strong>{t('region.flags')}</strong></p>
            {onUpdateFlags ? (
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
                  <button type="button" className="success" disabled={flagsBusy || !flagsDirty} onClick={() => void saveFlags()}>
                    {flagsBusy ? t('flagsManager.saving') : t('flagsManager.save')}
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
                        <td>{row.name}</td>
                        <td>{row.value}</td>
                        <td>{info?.type ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
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
