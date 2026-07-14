import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { FlagInfo, RegionData } from '../types';
import type { SpatialRelationsGrouped } from '../utils/graph';
import { isTemporaryRegion } from '../utils/regions';

interface RegionPanelProps {
  region: RegionData;
  childIds: string[];
  spatialRelations: SpatialRelationsGrouped;
  flagsCatalog: FlagInfo[];
  onClose: () => void;
  onFocusRegion: (regionId: string) => void;
  onDeleteManual?: (regionId: string) => void;
  canDelete?: boolean;
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
          <button type="button" onClick={() => onFocusRegion(pid)}>{pid}</button>
        </li>
      ))}
    </ul>
  );
}

export function RegionPanel({
  region,
  childIds,
  spatialRelations,
  flagsCatalog,
  onClose,
  onFocusRegion,
  onDeleteManual,
  canDelete = false,
}: RegionPanelProps) {
  const { t } = useI18n();
  const [showFlags, setShowFlags] = useState(false);

  const copyName = () => {
    navigator.clipboard.writeText(region.id);
  };

  const flagEntries = Object.entries(region.flags ?? {});
  const totalSpatial =
    spatialRelations.intersects.length
    + spatialRelations.containedIn.length
    + spatialRelations.contains.length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{region.id}</h2>
          <button type="button" onClick={onClose}>×</button>
        </header>

        <div className="modal-body">
          <p><strong>{t('region.type')}:</strong> {region.type}</p>
          <p>
            <strong>{t('region.parent')}:</strong>{' '}
            {region.parent ? (
              <button type="button" className="region-link" onClick={() => onFocusRegion(region.parent!)}>
                {region.parent}
              </button>
            ) : (
              '—'
            )}
          </p>
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

          {isTemporaryRegion(region) && <p className="badge-manual">{t('region.manualBadge')}</p>}

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

          <div className="modal-actions">
            <button type="button" onClick={copyName}>{t('region.copyName')}</button>
            <button type="button" onClick={() => setShowFlags(!showFlags)}>
              {showFlags ? t('region.hideFlags') : t('region.flags')}
            </button>
            {(canDelete || isTemporaryRegion(region)) && onDeleteManual && (
              <button type="button" className="danger" onClick={() => onDeleteManual(region.id)}>
                {t('region.deleteManual')}
              </button>
            )}
          </div>

          {showFlags && (
            <div className="flags-table-wrap">
              {flagEntries.length === 0 ? (
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
                    {flagEntries.map(([name, value]) => {
                      const info = flagsCatalog.find((f) => f.name === name);
                      return (
                        <tr key={name}>
                          <td>{name}</td>
                          <td>{JSON.stringify(value)}</td>
                          <td>{info?.type ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
