import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import type { FlagInfo, Scheme } from '../types';
import {
  buildFlagConflictReport,
  flagConflictExportFileName,
  serializeFlagConflictReport,
} from '../utils/flagConflictExport';
import { isUserCancelled, saveTextWithDialog } from '../utils/fileDialog';
import type { FlagConflictsResult, FlagOverwrite, SpatialConflict } from '../utils/flagConflicts';
import type { CrossFlagConflict } from '../utils/crossFlagRules';
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

/** «?» that opens the tab hint as a comic speech balloon. */
function HintBubble({ text }: { text: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; tail: number; above: boolean } | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setCoords(null);
      return;
    }
    const update = () => {
      const rect = rootRef.current!.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 24);
      let left = rect.left - 12;
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - width - 8);
      }
      const tail = Math.min(width - 28, Math.max(14, rect.left + rect.width / 2 - left - 8));
      let top = rect.bottom + 14;
      let above = false;
      if (top + 160 > window.innerHeight - 8) {
        top = Math.max(8, rect.top - 160 - 14);
        above = true;
      }
      setCoords({ top, left, tail, above });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (bubbleRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span className="flag-help hint-bubble-anchor" ref={rootRef}>
      <button
        type="button"
        className="flag-help-btn"
        aria-expanded={open}
        aria-controls={panelId}
        title={t('flagConflicts.hintOpen')}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        ?
      </button>
      {open && coords
        ? createPortal(
            <div
              ref={bubbleRef}
              id={panelId}
              className={`hint-bubble${coords.above ? ' hint-bubble--above' : ''}`}
              role="dialog"
              style={{ top: coords.top, left: coords.left, ['--hint-tail' as string]: `${coords.tail}px` }}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="hint-bubble-tail" aria-hidden />
              {text}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

function compareSpatial(a: SpatialConflict, b: SpatialConflict): number {
  const aFirst = compareNatural(a.aId, a.bId) <= 0 ? a.aId : a.bId;
  const aSecond = compareNatural(a.aId, a.bId) <= 0 ? a.bId : a.aId;
  const bFirst = compareNatural(b.aId, b.bId) <= 0 ? b.aId : b.bId;
  const bSecond = compareNatural(b.aId, b.bId) <= 0 ? b.bId : b.aId;
  return compareNatural(aFirst, bFirst) || compareNatural(aSecond, bSecond);
}

export function FlagConflictsDialog({
  scheme,
  result,
  flagsCatalog,
  onClose,
  onFocusRegion,
  onShowSpatialOnScheme,
  onShowOverwriteOnScheme,
  onStatus,
}: {
  scheme: Scheme;
  result: FlagConflictsResult;
  flagsCatalog: FlagInfo[];
  onClose: () => void;
  onFocusRegion: (id: string) => void;
  onShowSpatialOnScheme?: (conflict: SpatialConflict) => void;
  onShowOverwriteOnScheme?: (overwrite: FlagOverwrite) => void;
  onStatus?: (message: string) => void;
}) {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<'overwrites' | 'spatial' | 'cross'>('overwrites');
  const [showErrors, setShowErrors] = useState(true);
  const [showWarnings, setShowWarnings] = useState(true);
  const [exporting, setExporting] = useState(false);

  const exportReport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const text = serializeFlagConflictReport(
        buildFlagConflictReport(scheme, result, flagsCatalog, new Date().toISOString(), {
          errors: showErrors,
          warnings: showWarnings,
        }, locale),
      );
      const name = await saveTextWithDialog(
        text,
        flagConflictExportFileName(scheme.sourcePath),
        'application/json',
        {
          description: t('flagConflicts.exportFileType'),
          accept: { 'application/json': ['.json'] },
        },
      );
      onStatus?.(t('status.flagConflictsExported', { path: name }));
    } catch (err) {
      if (!isUserCancelled(err)) {
        onStatus?.(t('status.error', { msg: String(err) }));
      }
    } finally {
      setExporting(false);
    }
  };

  const visibleOverwrites = useMemo(
    () => (showWarnings ? result.overwrites : []),
    [showWarnings, result.overwrites],
  );
  const visibleSpatial = useMemo(
    () => result.spatialConflicts.filter((c) => (c.ambiguous ? showErrors : showWarnings)),
    [showErrors, showWarnings, result.spatialConflicts],
  );

  const overwritesByFlag = useMemo(
    () => groupByFlagNameSorted(visibleOverwrites, compareOverwrite),
    [visibleOverwrites],
  );
  const spatialByFlag = useMemo(
    () => groupByFlagNameSorted(visibleSpatial, compareSpatial),
    [visibleSpatial],
  );
  const visibleCross = useMemo(
    () => (showWarnings ? result.crossFlagConflicts : []),
    [showWarnings, result.crossFlagConflicts],
  );
  const crossByCategory = useMemo(() => {
    const groups = new Map<string, CrossFlagConflict[]>();
    for (const item of visibleCross) {
      const list = groups.get(item.category) ?? [];
      list.push(item);
      groups.set(item.category, list);
    }
    return [...groups.entries()].sort(([a], [b]) => compareNatural(a, b));
  }, [visibleCross]);

  const hasHardErrors = result.hardErrors.length > 0;

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal flag-conflicts-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('flagConflicts.dialogTitle')}</h2>
          <div className="flag-conflicts-header-actions">
            <button
              type="button"
              className="flag-conflicts-export"
              onClick={() => { void exportReport(); }}
              disabled={exporting}
            >
              {t('flagConflicts.export')}
            </button>
            <button type="button" className="modal-close" onClick={onClose}>×</button>
          </div>
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
              <div className="flag-conflicts-checks">
                <label>
                  <input
                    type="checkbox"
                    checked={showErrors}
                    onChange={() => setShowErrors((v) => !v)}
                  />
                  {t('flagConflicts.filterErrors')}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={showWarnings}
                    onChange={() => setShowWarnings((v) => !v)}
                  />
                  {t('flagConflicts.filterWarnings')}
                </label>
              </div>

              <div className="notifications-tabs flag-conflicts-switch" role="tablist">
                <button
                  type="button"
                  role="tab"
                  className={`notifications-tab${tab === 'overwrites' ? ' active' : ''}`}
                  aria-selected={tab === 'overwrites'}
                  onClick={() => setTab('overwrites')}
                >
                  {t('flagConflicts.tabOverwrites')} ({visibleOverwrites.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`notifications-tab${tab === 'spatial' ? ' active' : ''}`}
                  aria-selected={tab === 'spatial'}
                  onClick={() => setTab('spatial')}
                >
                  {t('flagConflicts.tabSpatial')} ({visibleSpatial.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`notifications-tab${tab === 'cross' ? ' active' : ''}`}
                  aria-selected={tab === 'cross'}
                  onClick={() => setTab('cross')}
                >
                  {t('flagConflicts.tabCross')} ({visibleCross.length})
                </button>
              </div>

              {tab === 'cross' ? (
                <>
                  <p className="flag-conflicts-count">
                    {t('flagConflicts.entryCount', { count: visibleCross.length })}
                    <HintBubble text={t('flagConflicts.crossHint')} />
                  </p>
                  {crossByCategory.map(([category, items]) => (
                    <div key={category} className="flag-conflicts-group">
                      <h3>{t(`flagConflicts.category.${category}` as TranslationKey)}</h3>
                      <ul>
                        {items.map((c) => (
                          <li key={`${c.scope}|${c.regionId}|${c.otherRegionId ?? ''}|${c.ruleId}|${c.flags.map((f) => f.name).join(',')}`}>
                            <div>
                              <strong>{t(`flagConflicts.rule.${c.ruleId}` as TranslationKey)}</strong>
                              {' · '}
                              <button type="button" className="region-link" onClick={() => onFocusRegion(c.regionId)}>
                                {c.regionId}
                              </button>
                              {c.otherRegionId && (
                                <>
                                  {' '}
                                  {c.relation === 'contains'
                                    ? t('flagConflicts.relationContains')
                                    : t('flagConflicts.relationIntersects')}
                                  {' '}
                                  <button type="button" className="region-link" onClick={() => onFocusRegion(c.otherRegionId!)}>
                                    {c.otherRegionId}
                                  </button>
                                </>
                              )}
                            </div>
                            <div>
                              {c.flags.map((f) => `${f.name}=${formatValue(f.value)} (${f.definedBy ?? c.regionId})`).join(' · ')}
                            </div>
                            <div className="flag-conflicts-outcome">{t(c.reasonKey as TranslationKey)}</div>
                            <div className="modal-actions">
                              <button
                                type="button"
                                className="primary"
                                onClick={() => {
                                  if (c.otherRegionId && c.relation && onShowSpatialOnScheme) {
                                    onShowSpatialOnScheme({
                                      flagName: c.flags[0]?.name ?? c.ruleId,
                                      relation: c.relation,
                                      aId: c.regionId,
                                      bId: c.otherRegionId,
                                      aPriority: 0,
                                      bPriority: 0,
                                      aValue: c.flags[0]?.value,
                                      bValue: c.flags[1]?.value,
                                      winnerId: undefined,
                                      winnerValue: undefined,
                                      ambiguous: false,
                                      commonAncestorId: null,
                                    });
                                    return;
                                  }
                                  onFocusRegion(c.regionId);
                                }}
                              >
                                {t('flagConflicts.showOnScheme')}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </>
              ) : tab === 'overwrites' ? (
                <>
                  <p className="flag-conflicts-count">
                    {t('flagConflicts.entryCount', { count: visibleOverwrites.length })}
                    <HintBubble text={t('flagConflicts.overwritesHint')} />
                  </p>
                  {visibleOverwrites.length === 0 ? null : (
                  <>
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
                  )}
                </>
              ) : (
                <>
                  <p className="flag-conflicts-count">
                    {t('flagConflicts.entryCount', { count: visibleSpatial.length })}
                    <HintBubble text={t('flagConflicts.spatialHint')} />
                  </p>
                  {visibleSpatial.length === 0 ? null : (
                  <>
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
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
