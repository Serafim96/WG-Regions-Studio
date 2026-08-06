import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { FlagInfo } from '../types';
import type { FlagConflictsResult, FlagOverwrite, SpatialConflict } from '../utils/flagConflicts';
import { compareNatural } from '../utils/naturalSort';
import { FlagNameWithHelp } from './FlagHelpButton';
import { ModalOverlay } from './ModalOverlay';

function formatValue(v: unknown): string {
  if (v === undefined || v === null) return '—';
  if (typeof v === 'string') return v === '' ? '""' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    const encoded = JSON.stringify(v);
    // JSON.stringify(undefined) / some toJSON results yield undefined (not a string).
    if (encoded === undefined) return '—';
    return encoded;
  } catch {
    return String(v);
  }
}

function groupByFlagNameSorted<T extends { flagName: string }>(
  items: T[],
  compareItem: (a: T, b: T) => number,
): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(item.flagName) ?? [];
    list.push(item);
    map.set(item.flagName, list);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => compareNatural(a, b))
    .map(([flagName, list]) => [flagName, [...list].sort(compareItem)]);
}

function compareOverwrite(a: FlagOverwrite, b: FlagOverwrite): number {
  return compareNatural(a.childId, b.childId)
    || compareNatural(a.parentId, b.parentId);
}

function compareSpatial(a: SpatialConflict, b: SpatialConflict): number {
  const aFirst = compareNatural(a.aId, a.bId) <= 0 ? a.aId : a.bId;
  const aSecond = compareNatural(a.aId, a.bId) <= 0 ? a.bId : a.aId;
  const bFirst = compareNatural(b.aId, b.bId) <= 0 ? b.aId : b.bId;
  const bSecond = compareNatural(b.aId, b.bId) <= 0 ? b.bId : b.aId;
  return compareNatural(aFirst, bFirst) || compareNatural(aSecond, bSecond);
}

export function FlagConflictsDialog({
  result,
  flagsCatalog,
  onClose,
  onFocusRegion,
  onShowSpatialOnScheme,
  onShowOverwriteOnScheme,
}: {
  result: FlagConflictsResult;
  flagsCatalog: FlagInfo[];
  onClose: () => void;
  onFocusRegion: (id: string) => void;
  onShowSpatialOnScheme?: (conflict: SpatialConflict) => void;
  onShowOverwriteOnScheme?: (overwrite: FlagOverwrite) => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'overwrites' | 'spatial'>('overwrites');

  const overwritesByFlag = useMemo(
    () => groupByFlagNameSorted(result.overwrites, compareOverwrite),
    [result.overwrites],
  );
  const spatialByFlag = useMemo(
    () => groupByFlagNameSorted(result.spatialConflicts, compareSpatial),
    [result.spatialConflicts],
  );

  const hasHardErrors = result.hardErrors.length > 0;

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal flag-conflicts-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('flagConflicts.dialogTitle')}</h2>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="modal-body">
          {hasHardErrors ? (
            <>
              <p className="flag-conflicts-hard">{t('flagConflicts.hardErrorsTitle')}</p>
              <ul>
                {result.hardErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <div className="flag-conflicts-tabs">
                <button
                  type="button"
                  className={tab === 'overwrites' ? 'primary' : ''}
                  onClick={() => setTab('overwrites')}
                >
                  {t('flagConflicts.tabOverwrites')}
                </button>
                <button
                  type="button"
                  className={tab === 'spatial' ? 'primary' : ''}
                  onClick={() => setTab('spatial')}
                >
                  {t('flagConflicts.tabSpatial')}
                </button>
              </div>

              {tab === 'overwrites' ? (
                result.overwrites.length === 0 ? (
                  <p className="flag-conflicts-empty">{t('flagConflicts.noneOverwrites')}</p>
                ) : (
                  <>
                  <p className="flag-conflicts-hint">{t('flagConflicts.overwritesHint')}</p>
                  {overwritesByFlag.map(([flagName, items]) => (
                      <div key={flagName} className="flag-conflicts-group">
                        <h3>
                          <FlagNameWithHelp name={flagName} flagsCatalog={flagsCatalog} />
                        </h3>
                        <ul>
                          {items.map((c: FlagOverwrite) => (
                            <li key={`${c.parentId}->${c.childId}:${flagName}`}>
                              <div>
                                <button
                                  type="button"
                                  className="region-link"
                                  onClick={() => onFocusRegion(c.childId)}
                                >
                                  {c.childId}
                                </button>
                                {' '}
                                {t('flagConflicts.overwritesAs', {
                                  value: formatValue(c.childValue),
                                })}
                                {' '}
                                <span className="flag-overwrite-parent">
                                  (
                                  <button
                                    type="button"
                                    className="region-link"
                                    onClick={() => onFocusRegion(c.parentId)}
                                  >
                                    {c.parentId}
                                  </button>
                                  {`: ${formatValue(c.parentValue)}`}
                                  )
                                </span>
                              </div>
                              {onShowOverwriteOnScheme && (
                                <div className="modal-actions">
                                  <button
                                    type="button"
                                    className="primary"
                                    onClick={() => onShowOverwriteOnScheme(c)}
                                  >
                                    {t('flagConflicts.showOnScheme')}
                                  </button>
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                  ))}
                  </>
                )
              ) : (
                result.spatialConflicts.length === 0 ? (
                  <p className="flag-conflicts-empty">{t('flagConflicts.noneSpatial')}</p>
                ) : (
                  <>
                  <p className="flag-conflicts-hint">{t('flagConflicts.spatialHint')}</p>
                  {spatialByFlag.map(([flagName, items]) => (
                      <div key={flagName} className="flag-conflicts-group">
                        <h3>
                          <FlagNameWithHelp name={flagName} flagsCatalog={flagsCatalog} />
                        </h3>
                        <ul>
                          {items.map((c: SpatialConflict) => {
                            const relationLabel = c.relation === 'contains'
                              ? t('flagConflicts.relationContains')
                              : t('flagConflicts.relationIntersects');
                            const outcome = c.ambiguous
                              ? t('flagConflicts.ambiguous')
                              : t('flagConflicts.winsSimple', {
                                id: c.winnerId ?? '?',
                                value: formatValue(c.winnerValue),
                              });
                            return (
                              <li
                                key={`${c.aId}-${c.bId}:${flagName}:${c.relation}`}
                                className={c.ambiguous ? 'flag-conflict-ambiguous' : ''}
                              >
                                <div>
                                  <button
                                    type="button"
                                    className="region-link"
                                    onClick={() => onFocusRegion(c.aId)}
                                  >
                                    {c.aId}
                                  </button>
                                  {' '}
                                  {t('flagConflicts.valueLabel', { value: formatValue(c.aValue) })}
                                  {' · '}
                                  {relationLabel}
                                  {' · '}
                                  <button
                                    type="button"
                                    className="region-link"
                                    onClick={() => onFocusRegion(c.bId)}
                                  >
                                    {c.bId}
                                  </button>
                                  {' '}
                                  {t('flagConflicts.valueLabel', { value: formatValue(c.bValue) })}
                                </div>
                                <div className="flag-conflicts-outcome">{outcome}</div>
                                {c.commonAncestorId && (
                                  <div className="flag-conflicts-outcome">
                                    {t('flagConflicts.commonAncestor')}
                                    {' '}
                                    <button
                                      type="button"
                                      className="region-link"
                                      onClick={() => onFocusRegion(c.commonAncestorId!)}
                                    >
                                      {c.commonAncestorId}
                                    </button>
                                  </div>
                                )}
                                {onShowSpatialOnScheme && (
                                  <div className="modal-actions">
                                    <button
                                      type="button"
                                      className="primary"
                                      onClick={() => onShowSpatialOnScheme(c)}
                                    >
                                      {t('flagConflicts.showOnScheme')}
                                    </button>
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                  ))}
                  </>
                )
              )}
            </>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
