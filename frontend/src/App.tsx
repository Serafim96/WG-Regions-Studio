import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addManualRegion,
  buildScheme,
  deleteManualRegion,
  fetchFlags,
  loadScheme,
  parseYaml,
  saveScheme,
} from './api';
import { AddRegionDialog } from './components/AddRegionDialog';
import { DeleteManualRegionDialog, type DeleteChildrenMode } from './components/DeleteManualRegionDialog';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GraphView, type GraphViewHandle } from './components/GraphView';
import { LegendPanel } from './components/LegendPanel';
import { MetricsPanel } from './components/MetricsPanel';
import { OrphanWarningPanel } from './components/OrphanWarningPanel';
import { RegionPanel } from './components/RegionPanel';
import { SearchPanel } from './components/SearchPanel';
import type { FlagInfo, ForestNode, RegionData, Scheme } from './types';
import {
  buildParentMap,
  collectDescendants,
  findOrphanRegionIds,
  getSpatialRelationsGrouped,
  revealPathToNode,
} from './utils/graph';
import { collectDeletableRegionIds, isTemporaryRegion } from './utils/regions';
import {
  computeCollapseAllHidden,
  computeDefaultHiddenNodes,
  computeExpandAllHidden,
} from './utils/layout';
import { loadAppSettings, saveAppSettings } from './utils/settings';
import { loadViewState, saveViewState } from './utils/viewState';
import { useI18n } from './i18n/I18nContext';
import { useTheme } from './theme/ThemeContext';

function findForestNode(scheme: Scheme, id: string): ForestNode | null {
  function search(nodes: ForestNode[]): ForestNode | null {
    for (const n of nodes) {
      if (n.id === id) return n;
      const found = search(n.children);
      if (found) return found;
    }
    return null;
  }
  return search(scheme.forest.roots);
}

export default function App() {
  const initialSettings = loadAppSettings();
  const { t, locale, setLocale } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const graphRef = useRef<GraphViewHandle>(null);
  const focusSeqRef = useRef(0);
  const centerSeqRef = useRef(0);

  const [scheme, setScheme] = useState<Scheme | null>(null);
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [hiddenNodes, setHiddenNodes] = useState<Set<string>>(new Set());
  const [orphanIds, setOrphanIds] = useState<Set<string>>(new Set());
  const [showOrphanWarning, setShowOrphanWarning] = useState(false);
  const [flagsCatalog, setFlagsCatalog] = useState<FlagInfo[]>([]);
  const [showMetrics, setShowMetrics] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addDialogLockedParent, setAddDialogLockedParent] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<{ regionId: string; childIds: string[] } | null>(null);
  const [deletableRegionIds, setDeletableRegionIds] = useState<Set<string>>(new Set());
  const [collapseThreshold, setCollapseThreshold] = useState(initialSettings.collapseThreshold);
  const [baseSize] = useState(60);
  const [collapseTarget, setCollapseTarget] = useState<string | null>(null);
  const [loadedYamlHash, setLoadedYamlHash] = useState<string | null>(null);
  const [hashWarning, setHashWarning] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ id: string; seq: number } | null>(null);
  const [centerRequest, setCenterRequest] = useState<{ id: string; seq: number } | null>(null);
  const schemeKeyRef = useRef('default');
  const isFreshSchemeRef = useRef(false);

  useEffect(() => {
    fetchFlags().then(setFlagsCatalog);
  }, []);

  useEffect(() => {
    if (!scheme) setStatus(t('status.loadYaml'));
  }, [locale, t, scheme]);

  useEffect(() => {
    saveAppSettings({ ...loadAppSettings(), collapseThreshold });
  }, [collapseThreshold]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        if (scheme) setShowSearch(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scheme]);

  useEffect(() => {
    if (!scheme) return;
    const key = scheme.sourceHash || 'default';
    schemeKeyRef.current = key;
    const saved = loadViewState(key);
    if (isFreshSchemeRef.current) {
      isFreshSchemeRef.current = false;
    } else if (saved) {
      setHiddenNodes(new Set(saved.hiddenNodes));
      setCollapseTarget(saved.collapseTarget);
    }
  }, [scheme?.sourceHash]);

  useEffect(() => {
    if (!scheme) return;
    saveViewState(schemeKeyRef.current, {
      hiddenNodes: Array.from(hiddenNodes),
      collapseTarget,
    });
  }, [scheme, hiddenNodes, collapseTarget]);

  const detailsRegion: RegionData | null = useMemo(() => {
    if (!scheme || !detailsId) return null;
    return scheme.regions.find((r) => r.id === detailsId) ?? null;
  }, [scheme, detailsId]);

  const detailsChildIds = useMemo(() => {
    if (!scheme || !detailsId) return [];
    const node = findForestNode(scheme, detailsId);
    if (!node) return [];
    return node.children.map((c) => c.id).sort();
  }, [scheme, detailsId]);

  const detailsSpatialRelations = useMemo(() => {
    if (!scheme || !detailsId) {
      return { intersects: [], containedIn: [], contains: [] };
    }
    return getSpatialRelationsGrouped(scheme, detailsId);
  }, [scheme, detailsId]);

  const regionIdList = useMemo(
    () => (scheme ? scheme.regions.map((r) => r.id).sort() : []),
    [scheme],
  );

  useEffect(() => {
    if (!scheme) {
      setDeletableRegionIds(new Set());
      return;
    }
    setDeletableRegionIds((prev) => {
      const next = collectDeletableRegionIds(scheme);
      for (const id of prev) {
        if (scheme.regions.some((region) => region.id === id)) {
          next.add(id);
        }
      }
      return next;
    });
  }, [scheme]);

  const applyOrphans = useCallback((next: Scheme, showWarning = true) => {
    const orphans = findOrphanRegionIds(next.regions);
    setOrphanIds(new Set(orphans));
    setShowOrphanWarning(showWarning && orphans.length > 0);
  }, []);

  const applyScheme = useCallback((
    next: Scheme,
    fresh: boolean,
    threshold: number,
    options?: { skipOrphanWarning?: boolean },
  ) => {
    isFreshSchemeRef.current = fresh;
    applyOrphans(next, !options?.skipOrphanWarning);
    if (fresh) {
      const defaults = computeDefaultHiddenNodes(next, threshold);
      setHiddenNodes(defaults);
      setScheme(next);
      return defaults.size;
    }
    setScheme(next);
    return 0;
  }, [applyOrphans]);

  const parentOptions = useMemo(
    () => (scheme ? scheme.regions.map((r) => r.id).sort() : []),
    [scheme],
  );

  const requestCenterOn = useCallback((regionId: string) => {
    centerSeqRef.current += 1;
    setCenterRequest({ id: regionId, seq: centerSeqRef.current });
  }, []);

  const focusRegion = useCallback((regionId: string) => {
    if (!scheme) return;
    const parentMap = buildParentMap(scheme.regions);
    setHiddenNodes((prev) => revealPathToNode(regionId, prev, parentMap));
    setSelectedId(regionId);
    setCollapseTarget(regionId);
    focusSeqRef.current += 1;
    setFocusRequest({ id: regionId, seq: focusSeqRef.current });
  }, [scheme]);

  const handleYamlUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const preview = await parseYaml(file);
      const newHash = preview.source_hash;

      if (scheme && scheme.sourceHash && scheme.sourceHash !== newHash) {
        setHashWarning(
          t('warn.yamlMismatch', { oldHash: scheme.sourceHash, newHash }),
        );
      } else {
        setHashWarning(null);
      }

      setLoadedYamlHash(newHash);
      setStatus(t('status.loaded', { count: preview.count, path: preview.source_path }));
      setScheme(null);
      setHiddenNodes(new Set());
      setOrphanIds(new Set());
      setDeletableRegionIds(new Set());
      setShowOrphanWarning(false);
      setSelectedId(null);
      setDetailsId(null);
      isFreshSchemeRef.current = true;
    } catch (err) {
      setStatus(t('status.error', { msg: String(err) }));
    }
    e.target.value = '';
  };

  const handleBuild = async () => {
    try {
      setStatus(t('status.building'));
      const result = await buildScheme();
      const collapsed = applyScheme(result.scheme, true, collapseThreshold);
      setHashWarning(null);
      let msg = t('status.schemeReady', {
        nodes: result.scheme.regions.length,
        edges: result.scheme.spatialEdges.length,
      });
      if (collapsed > 0) {
        msg += t('status.autoCollapsed', { count: collapsed, threshold: collapseThreshold });
      }
      setStatus(msg);
    } catch (err) {
      setStatus(t('status.error', { msg: String(err) }));
    }
  };

  const handleSaveScheme = async () => {
    const path = prompt(t('prompt.saveScheme'), 'scheme.mrv.json');
    if (!path) return;
    try {
      await saveScheme(path);
      setStatus(t('status.schemeSaved', { path }));
    } catch (err) {
      setStatus(t('status.error', { msg: String(err) }));
    }
  };

  const handleLoadScheme = async () => {
    const path = prompt(t('prompt.loadScheme'), 'scheme.mrv.json');
    if (!path) return;
    try {
      const loaded = await loadScheme(path);
      const collapsed = applyScheme(loaded, true, collapseThreshold);

      if (loadedYamlHash && loaded.sourceHash !== loadedYamlHash) {
        setHashWarning(
          t('warn.schemeMismatch', { schemeHash: loaded.sourceHash, yamlHash: loadedYamlHash }),
        );
      } else {
        setHashWarning(null);
      }

      let msg = t('status.schemeLoaded', { nodes: loaded.regions.length });
      if (collapsed > 0) msg += t('status.autoCollapsedShort', { count: collapsed });
      setStatus(msg);
    } catch (err) {
      setStatus(t('status.error', { msg: String(err) }));
    }
  };

  const toggleChildren = useCallback((regionId: string, hide: boolean) => {
    if (!scheme) return;
    const node = findForestNode(scheme, regionId);
    if (!node) return;
    const childIds = node.children.map((c: ForestNode) => c.id);
    const allIds = hide
      ? node.children.flatMap((c) => [c.id, ...collectDescendants(c)])
      : childIds;
    setHiddenNodes((prev) => {
      const next = new Set(prev);
      for (const cid of allIds) {
        if (hide) next.add(cid);
        else next.delete(cid);
      }
      return next;
    });
    requestCenterOn(regionId);
  }, [scheme, requestCenterOn]);

  const toggleRecursive = useCallback((regionId: string, hide: boolean) => {
    if (!scheme) return;
    const node = findForestNode(scheme, regionId);
    if (!node) return;
    const ids = collectDescendants(node);
    setHiddenNodes((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (hide) next.add(id);
        else next.delete(id);
      }
      return next;
    });
    requestCenterOn(regionId);
  }, [scheme, requestCenterOn]);

  const handleCollapseAll = useCallback(() => {
    if (!scheme) return;
    setHiddenNodes(computeCollapseAllHidden(scheme));
    if (collapseTarget) requestCenterOn(collapseTarget);
    setStatus(t('status.collapseAll'));
  }, [scheme, collapseTarget, requestCenterOn, t]);

  const handleExpandAll = useCallback(() => {
    setHiddenNodes(computeExpandAllHidden());
    if (collapseTarget) requestCenterOn(collapseTarget);
    setStatus(t('status.expandAll'));
  }, [collapseTarget, requestCenterOn, t]);

  const openAddDialog = useCallback((lockedParent?: string) => {
    setAddDialogLockedParent(lockedParent);
    setShowAddDialog(true);
  }, []);

  const closeAddDialog = useCallback(() => {
    setShowAddDialog(false);
    setAddDialogLockedParent(undefined);
  }, []);

  const handleAddManual = async (data: {
    id: string;
    parent: string | null;
    priority: number;
    flags: Record<string, string>;
    isGlobal: boolean;
  }) => {
    try {
      await addManualRegion({
        id: data.id,
        parent: data.parent,
        priority: data.priority,
        flags: data.flags,
        type: data.isGlobal ? 'manual' : 'global',
        owners: {},
        members: {},
      });
      const result = await buildScheme();
      applyScheme(result.scheme, true, collapseThreshold, { skipOrphanWarning: true });
      setDeletableRegionIds((prev) => new Set(prev).add(data.id));
      closeAddDialog();
      const parentMap = buildParentMap(result.scheme.regions);
      setHiddenNodes((prev) => revealPathToNode(data.id, prev, parentMap));
      setSelectedId(data.id);
      setCollapseTarget(data.id);
      focusSeqRef.current += 1;
      setFocusRequest({ id: data.id, seq: focusSeqRef.current });
      setStatus(t('status.manualAdded', { id: data.id }));
    } catch (err) {
      setStatus(t('status.error', { msg: String(err) }));
    }
  };

  const onNodeSelect = useCallback((id: string) => {
    setSelectedId(id);
    setCollapseTarget(id);
  }, []);

  const onNodeOpen = useCallback((id: string) => {
    setSelectedId(id);
    setCollapseTarget(id);
    setDetailsId(id);
  }, []);

  const onCopyName = useCallback((id: string) => {
    navigator.clipboard.writeText(id);
    setStatus(t('status.copied', { id }));
  }, [t]);

  const onContextCollapse = useCallback((id: string, hide: boolean) => {
    setCollapseTarget(id);
    setSelectedId(id);
    toggleChildren(id, hide);
  }, [toggleChildren]);

  const onAddDescendant = useCallback((id: string) => {
    openAddDialog(id);
  }, [openAddDialog]);

  const requestDeleteManual = useCallback((regionId: string) => {
    if (!scheme) return;
    const region = scheme.regions.find((r) => r.id === regionId);
    if (!deletableRegionIds.has(regionId) && !isTemporaryRegion(region)) return;
    const node = findForestNode(scheme, regionId);
    const childIds = node?.children.map((child) => child.id) ?? [];
    setDeleteTarget({ regionId, childIds });
  }, [scheme, deletableRegionIds]);

  const handleConfirmDeleteManual = async (mode: DeleteChildrenMode) => {
    if (!deleteTarget || !scheme) return;
    const { regionId } = deleteTarget;
    try {
      await deleteManualRegion(regionId, mode);
      const result = await buildScheme();

      const node = findForestNode(scheme, regionId);
      const removedIds = new Set<string>([regionId]);
      if (mode === 'cascade' && node) {
        for (const id of collectDescendants(node)) {
          removedIds.add(id);
        }
      }

      applyScheme(result.scheme, false, collapseThreshold);
      setHiddenNodes((prev) => {
        const next = new Set(prev);
        for (const id of removedIds) next.delete(id);
        return next;
      });
      if (selectedId && removedIds.has(selectedId)) {
        setSelectedId(null);
        setCollapseTarget(null);
      }
      if (detailsId && removedIds.has(detailsId)) {
        setDetailsId(null);
      }
      setDeleteTarget(null);
      setDeletableRegionIds(collectDeletableRegionIds(result.scheme));
      setStatus(t('status.manualDeleted', { id: regionId }));
    } catch (err) {
      setStatus(t('status.error', { msg: String(err) }));
    }
  };

  const blockBrowserMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <div className="app">
      <aside className="toolbar">
        <h1>{t('app.title')}</h1>

        <div className="preferences-row">
          <div className="lang-switch">
            <span className="lang-switch-label">{t('app.language')}:</span>
            <button
              type="button"
              className={locale === 'ru' ? 'lang-btn active' : 'lang-btn'}
              onClick={() => setLocale('ru')}
            >
              RU
            </button>
            <button
              type="button"
              className={locale === 'en' ? 'lang-btn active' : 'lang-btn'}
              onClick={() => setLocale('en')}
            >
              EN
            </button>
          </div>
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === 'light' ? t('app.themeToDark') : t('app.themeToLight')}
            aria-label={theme === 'light' ? t('app.themeToDark') : t('app.themeToLight')}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>

        <label className="file-btn">
          {t('app.openYaml')}
          <input type="file" accept=".yml,.yaml" onChange={handleYamlUpload} hidden />
        </label>
        <button type="button" onClick={handleBuild}>{t('app.buildScheme')}</button>
        <button type="button" onClick={handleLoadScheme}>{t('app.loadScheme')}</button>
        <button type="button" onClick={handleSaveScheme} disabled={!scheme}>{t('app.saveScheme')}</button>
        <button type="button" onClick={() => openAddDialog()} disabled={!scheme}>
          {t('app.addManual')}
        </button>
        <button type="button" onClick={() => setShowSearch(true)} disabled={!scheme}>
          {t('app.search')}
        </button>
        <button type="button" onClick={() => setShowMetrics(true)} disabled={!scheme}>
          {t('app.metrics')}
        </button>
        <button type="button" onClick={() => setShowLegend(true)}>{t('app.legend')}</button>

        {scheme && (
          <div className="collapse-all-block">
            <button type="button" onClick={handleCollapseAll}>{t('app.collapseAll')}</button>
            <button type="button" onClick={handleExpandAll}>{t('app.expandAll')}</button>
          </div>
        )}

        <div className="settings-block">
          <p className="depth-scale-title">{t('app.autoCollapse')}</p>
          <p className="depth-scale-hint">{t('app.autoCollapseHint')}</p>
          <label>
            {t('app.threshold')}: {collapseThreshold}
            <input
              type="range"
              min={0}
              max={200}
              step={1}
              value={collapseThreshold}
              onChange={(e) => setCollapseThreshold(Number(e.target.value))}
            />
          </label>
        </div>

        {hashWarning && <p className="hash-warning">{hashWarning}</p>}

        {collapseTarget && scheme && (
          <div className="collapse-panel">
            <p>{t('app.selected')}: <strong>{collapseTarget}</strong></p>
            <button type="button" onClick={() => toggleChildren(collapseTarget, true)}>{t('app.hideChildren')}</button>
            <button type="button" onClick={() => toggleChildren(collapseTarget, false)}>{t('app.showChildren')}</button>
            <button type="button" onClick={() => toggleRecursive(collapseTarget, true)}>{t('app.collapseRecursive')}</button>
            <button type="button" onClick={() => toggleRecursive(collapseTarget, false)}>{t('app.expandRecursive')}</button>
          </div>
        )}

        <p className="status">{status}</p>
        <p className="hint">{t('app.hint')}</p>
      </aside>

      <main className="graph-area" onContextMenu={blockBrowserMenu}>
        {scheme ? (
          <ErrorBoundary>
            <GraphView
              ref={graphRef}
              scheme={scheme}
              hiddenNodes={hiddenNodes}
              orphanIds={orphanIds}
              selectedId={selectedId}
              baseSize={baseSize}
              focusRequest={focusRequest}
              centerRequest={centerRequest}
              deletableRegionIds={deletableRegionIds}
              onNodeSelect={onNodeSelect}
              onNodeOpen={onNodeOpen}
              onCopyName={onCopyName}
              onAddDescendant={onAddDescendant}
              onDeleteManual={requestDeleteManual}
              onCollapseChildren={(id) => onContextCollapse(id, true)}
              onExpandChildren={(id) => onContextCollapse(id, false)}
            />
          </ErrorBoundary>
        ) : (
          <div className="placeholder">{t('app.placeholder')}</div>
        )}
      </main>

      {detailsRegion && (
        <RegionPanel
          region={detailsRegion}
          childIds={detailsChildIds}
          spatialRelations={detailsSpatialRelations}
          flagsCatalog={flagsCatalog}
          onClose={() => setDetailsId(null)}
          onFocusRegion={focusRegion}
          onDeleteManual={requestDeleteManual}
          canDelete={deletableRegionIds.has(detailsRegion.id)}
        />
      )}
      {deleteTarget && (
        <DeleteManualRegionDialog
          regionId={deleteTarget.regionId}
          childIds={deleteTarget.childIds}
          onConfirm={handleConfirmDeleteManual}
          onClose={() => setDeleteTarget(null)}
        />
      )}
      {showMetrics && scheme && (
        <MetricsPanel metrics={scheme.metrics} onClose={() => setShowMetrics(false)} />
      )}
      {showLegend && <LegendPanel onClose={() => setShowLegend(false)} />}
      {showSearch && scheme && (
        <SearchPanel
          regionIds={regionIdList}
          onClose={() => setShowSearch(false)}
          onSelect={focusRegion}
        />
      )}
      {showOrphanWarning && orphanIds.size > 0 && (
        <OrphanWarningPanel
          orphanIds={Array.from(orphanIds).sort()}
          onClose={() => setShowOrphanWarning(false)}
        />
      )}
      {showAddDialog && (
        <AddRegionDialog
          key={addDialogLockedParent ?? 'free'}
          regionIds={parentOptions}
          lockedParent={addDialogLockedParent}
          onAdd={handleAddManual}
          onClose={closeAddDialog}
        />
      )}
    </div>
  );
}
