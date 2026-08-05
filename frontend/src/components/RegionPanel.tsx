import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { FlagInfo, RegionData } from '../types';
import type { SpatialRelationsGrouped } from '../utils/graph';
import { isTemporaryRegion } from '../utils/regions';
import { findFlagInfo } from './FlagHelpButton';
import { FlagNameCombobox } from './FlagNameCombobox';
import { FlagValueInput } from './FlagValueInput';
import {
  geometryFromRegion,
  geometryToPayload,
  RegionGeometryEditor,
  type GeometryPayload,
  type RegionGeometryState,
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
}

function PartnerList({
  ids,
  emptyText,
  onFocusRegion,
}: {
  ids: string[];
  emptyText: string;
  onFocusRegion: (id: string) => void;
}) {
  if (ids.length === 0) return <p className="partners-empty">{emptyText}</p>;
  return (
    <ul className="partners-list">
      {ids.map((pid) => (
        <li key={pid}>
          <button type="button" className="region-link" onClick={() => onFocusRegion(pid)}>{pid}</button>
        </li>
      ))}
    </ul>
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
  canDelete = false,
  onUpdateParent,
  onUpdateFlags,
  onUpdateGeometry,
}: RegionPanelProps) {
  const { t } = useI18n();
  const [editingParent, setEditingParent] = useState(false);
  const [parentQuery, setParentQuery] = useState(region.parent ?? '');
  const [parentBusy, setParentBusy] = useState(false);
  const [parentError, setParentError] = useState<string | null>(null);

  const isTemp = isTemporaryRegion(region);
  const [geometry, setGeometry] = useState<RegionGeometryState>(() => geometryFromRegion(region));
  const [geometryBusy, setGeometryBusy] = useState(false);
  const [geometryError, setGeometryError] = useState<string | null>(null);
  const [geometryDirty, setGeometryDirty] = useState(false);

  const [flagRows, setFlagRows] = useState<FlagRow[]>(() => flagsToRows(region.flags ?? {}));
  const [flagsDirty, setFlagsDirty] = useState(false);
  const [flagsBusy, setFlagsBusy] = useState(false);
  const [flagsError, setFlagsError] = useState<string | null>(null);

  useEffect(() => {
    setGeometry(geometryFromRegion(region));
    setGeometryDirty(false);
    setGeometryError(null);
    setFlagRows(flagsToRows(region.flags ?? {}));
    setFlagsDirty(false);
    setFlagsError(null);
    setParentQuery(region.parent ?? '');
    setEditingParent(false);
  }, [region]);

  const parentCandidates = useMemo(() => {
    const q = parentQuery.trim().toLowerCase();
    const excluded = new Set([region.id, ...childIds]);
    return regionIds
      .filter((id) => !excluded.has(id))
      .filter((id) => !q || id.toLowerCase().includes(q))
      .slice(0, 40);
  }, [parentQuery, regionIds, region.id, childIds]);

  const resolvedParent = useMemo(() => {
    const q = parentQuery.trim();
    if (!q) return null;
    return regionIds.find((id) => id.toLowerCase() === q.toLowerCase() && id !== region.id) ?? undefined;
  }, [parentQuery, regionIds, region.id]);

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

  const onGeometryChange = (next: RegionGeometryState) => {
    setGeometry(next);
    setGeometryDirty(true);
  };

  const saveGeometry = async () => {
    if (!onUpdateGeometry) return;
    setGeometryBusy(true);
    setGeometryError(null);
    try {
      await onUpdateGeometry(region.id, geometryToPayload(geometry));
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

  const totalSpatial =
    spatialRelations.intersects.length
    + spatialRelations.containedIn.length
    + spatialRelations.contains.length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal region-panel-modal" onClick={(e) => e.stopPropagation()}>
        <header className="region-panel-header">
          <div className="region-panel-title">
            <h2>{region.id}</h2>
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
          <button type="button" onClick={onClose}>×</button>
        </header>

        <div className="modal-body">
          <p><strong>{t('region.type')}:</strong> {region.type}</p>
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
                {parentQuery.trim() && parentCandidates.length > 1 && (
                  <ul className="search-results">
                    {parentCandidates.map((id) => (
                      <li key={id}>
                        <button type="button" onClick={() => setParentQuery(id)}>{id}</button>
                      </li>
                    ))}
                  </ul>
                )}
                {parentError && <p className="flags-manager-error">{parentError}</p>}
                <div className="modal-actions">
                  <button
                    type="button"
                    disabled={parentBusy || (parentQuery.trim() !== '' && resolvedParent === undefined)}
                    onClick={() => saveParent(parentQuery.trim() ? resolvedParent! : null)}
                  >
                    {t('region.saveParent')}
                  </button>
                  <button
                    type="button"
                    disabled={parentBusy || !region.parent}
                    onClick={() => saveParent(null)}
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
          <p><strong>{t('region.priority')}:</strong> {region.priority}</p>

          <div className="partners-block children-block">
            <p className="partners-subtitle">
              {t('region.children', { count: childIds.length })}
            </p>
            <PartnerList
              ids={childIds}
              emptyText={t('region.noChildren')}
              onFocusRegion={onFocusRegion}
            />
          </div>

          {isTemp && <p className="badge-manual">{t('region.manualBadge')}</p>}

          {isTemp && onUpdateGeometry ? (
            <div className="region-geometry-block">
              <p className="partners-subtitle">{t('region.geometryTitle')}</p>
              <RegionGeometryEditor
                value={geometry}
                onChange={onGeometryChange}
                disabled={geometryBusy}
              />
              {geometryError && <p className="flags-manager-error">{geometryError}</p>}
              <div className="modal-actions">
                <button type="button" disabled={geometryBusy || !geometryDirty} onClick={saveGeometry}>
                  {geometryBusy ? t('region.savingGeometry') : t('region.saveGeometry')}
                </button>
              </div>
            </div>
          ) : (
            <>
              {region.min && region.max && (
                <p>
                  <strong>{t('region.coords')}:</strong> min ({region.min.x}, {region.min.y}, {region.min.z}) —
                  max ({region.max.x}, {region.max.y}, {region.max.z})
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
            <strong>{t('region.spatialLinks', { count: totalSpatial })}</strong>

            <div className="partners-subsection">
              <p className="partners-subtitle">
                {t('region.intersects', { count: spatialRelations.intersects.length })}
              </p>
              <PartnerList
                ids={spatialRelations.intersects}
                emptyText={t('region.noIntersects')}
                onFocusRegion={onFocusRegion}
              />
            </div>

            <div className="partners-subsection">
              <p className="partners-subtitle">
                {t('region.containedIn', { count: spatialRelations.containedIn.length })}
              </p>
              <p className="partners-hint">{t('region.containedInHint')}</p>
              <PartnerList
                ids={spatialRelations.containedIn}
                emptyText={t('region.notContainedIn')}
                onFocusRegion={onFocusRegion}
              />
            </div>

            <div className="partners-subsection">
              <p className="partners-subtitle">
                {t('region.contains', { count: spatialRelations.contains.length })}
              </p>
              <p className="partners-hint">{t('region.containsHint')}</p>
              <PartnerList
                ids={spatialRelations.contains}
                emptyText={t('region.containsNone')}
                onFocusRegion={onFocusRegion}
              />
            </div>
          </div>

          <p><strong>Owners:</strong> {JSON.stringify(region.owners)}</p>
          <p><strong>Members:</strong> {JSON.stringify(region.members)}</p>

          {(canDelete || isTemp) && onDeleteManual && (
            <div className="modal-actions">
              <button type="button" className="danger" onClick={() => onDeleteManual(region.id)}>
                {t('region.deleteManual')}
              </button>
            </div>
          )}

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
                  <button type="button" disabled={flagsBusy || !flagsDirty} onClick={saveFlags}>
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
        </div>
      </div>
    </div>
  );
}
