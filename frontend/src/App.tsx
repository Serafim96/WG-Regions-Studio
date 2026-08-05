import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addManualRegion,
  buildScheme,
  bulkUpdateFlags,
  clearSession,
  exportRegionsYaml,
  deleteManualRegion,
  fetchFlags,
  addCustomFlag,
  deleteAllCustomFlags,
  deleteCustomFlag,
  exportCustomFlags,
  importCustomFlags,
  importScheme,
  parseYaml,
  updateRegionFlags,
  updateRegionGeometry,
  updateRegionParent,
} from './api';
import { AddRegionDialog } from './components/AddRegionDialog';
import { DeleteManualRegionDialog, type DeleteChildrenMode } from './components/DeleteManualRegionDialog';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FlagConflictsDialog } from './components/FlagConflictsDialog';
import { FlagsManagerDialog } from './components/FlagsManagerDialog';
import { FlagsCatalogDialog } from './components/FlagsCatalogDialog';
import {
  IconAdd,
  IconClearHighlight,
  IconCollapseAll,
  IconEdgeFilter,
  IconExpandAll,
  IconExpandThreshold,
  IconFullscreen,
  IconFullscreenExit,
  IconLegend,
  IconLock,
  IconSearch,
  IconUnlock,
  IconWarning,
  IconZoomIn,
  IconZoomOut,
} from './components/GraphControlIcons';
import {
  GraphView,
  type EdgeDisplayMode,
  type GraphViewHandle,
  type HighlightBranchMode,
} from './components/GraphView';
import { LegendPanel } from './components/LegendPanel';
import { MetricsPanel } from './components/MetricsPanel';
import {
  NotificationsBell,
  type AppNotification,
} from './components/NotificationsBell';
import { OrphanWarningPanel } from './components/OrphanWarningPanel';
import { RegionPanel } from './components/RegionPanel';
import { SearchPanel } from './components/SearchPanel';
import type { FlagInfo, ForestNode, RegionData, Scheme } from './types';
import {
  buildParentMap,
  collectContainmentChain,
  collectDescendants,
  collectHighlightEdgeKeys,
  collectIntersectsPartners,
  collectParentChain,
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
import { runWorldGuardFlagChecks, type SpatialConflict } from './utils/flagConflicts';
import { isUserCancelled, openTextFileWithDialog, saveTextWithDialog } from './utils/fileDialog';
import { attachConflictInheritancePaths, buildFlagHighlight, enrichHighlightWithFlagValues } from './utils/flagTree';
import { loadAppSettings, saveAppSettings, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from './utils/settings';
import { loadViewState, saveViewState, clearViewState } from './utils/viewState';
import { useI18n } from './i18n/I18nContext';
import { useTheme } from './theme/ThemeContext';

/** Legacy keys — cleared on startup; notifications are session-only. */
const NOTIFICATIONS_STORAGE_KEYS = ['mrv.notifications.v3', 'mrv.notifications.v2', 'mrv.notifications.v1'];

function clearPersistedNotifications() {
  try {
    for (const key of NOTIFICATIONS_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

function formatFlagValueShort(v: unknown): string {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

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
  const fitSeqRef = useRef(0);
  const viewResetSeqRef = useRef(0);

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
  const [legendMode, setLegendMode] = useState<'scheme' | 'flagHighlight'>('scheme');
  const [showFlagsCatalog, setShowFlagsCatalog] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showFlagsManager, setShowFlagsManager] = useState(false);
  const [flagsManagerFocusId, setFlagsManagerFocusId] = useState<string | null>(null);
  const [showFlagConflictsDialog, setShowFlagConflictsDialog] = useState(false);
  const [highlightFlag, setHighlightFlag] = useState<string | null>(null);
  const [conflictSchemeView, setConflictSchemeView] = useState<SpatialConflict | null>(null);
  const [overwriteSchemeView, setOverwriteSchemeView] = useState<{
    flagName: string;
    parentId: string;
    childId: string;
  } | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationToasts, setNotificationToasts] = useState<AppNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const notifiedConflictKeysRef = useRef<Set<string>>(new Set());
  /** Scheme for which current conflict keys were seeded (load: only ambiguous → bell). */
  const conflictNotifySeededForRef = useRef<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addDialogLockedParent, setAddDialogLockedParent] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<{ regionId: string; childIds: string[] } | null>(null);
  const [deletableRegionIds, setDeletableRegionIds] = useState<Set<string>>(new Set());
  const [collapseThreshold, setCollapseThreshold] = useState(initialSettings.collapseThreshold);
  const [baseSize] = useState(60);
  const [collapseTarget, setCollapseTarget] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialSettings.sidebarCollapsed);
  const [sidebarWidth, setSidebarWidth] = useState(initialSettings.sidebarWidth);
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [graphLocked, setGraphLocked] = useState(true);
  const [loadedYamlHash, setLoadedYamlHash] = useState<string | null>(null);
  const [hasPendingYaml, setHasPendingYaml] = useState(false);
  const [hashWarning, setHashWarning] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ id: string; seq: number } | null>(null);
  const [centerRequest, setCenterRequest] = useState<{ id: string; seq: number } | null>(null);
  const [fitRequest, setFitRequest] = useState<{ ids: string[]; seq: number } | null>(null);
  const [viewResetRequest, setViewResetRequest] = useState<{ seq: number } | null>(null);
  const [problemFilter, setProblemFilter] = useState<'error' | 'warning' | null>(null);
  const [showProblemsMenu, setShowProblemsMenu] = useState(false);
  const [subtreeHighlightRoot, setSubtreeHighlightRoot] = useState<string | null>(null);
  const [subtreeHighlightIds, setSubtreeHighlightIds] = useState<Set<string> | null>(null);
  const [subtreeHighlightMode, setSubtreeHighlightMode] = useState<HighlightBranchMode | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [edgeDisplayMode, setEdgeDisplayMode] = useState<EdgeDisplayMode>('all');
  const [showEdgeModeMenu, setShowEdgeModeMenu] = useState(false);
  const schemeKeyRef = useRef('default');
  const isFreshSchemeRef = useRef(false);

  useEffect(() => {
    if (!showProblemsMenu) return;
    const close = () => setShowProblemsMenu(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [showProblemsMenu]);

  useEffect(() => {
    if (!showEdgeModeMenu) return;
    const close = () => setShowEdgeModeMenu(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [showEdgeModeMenu]);

  useEffect(() => {
    fetchFlags().then(setFlagsCatalog);
    clearPersistedNotifications();
  }, []);

  useEffect(() => {
    if (!scheme) setStatus(t('status.loadYaml'));
  }, [locale, t, scheme]);

  useEffect(() => {
    saveAppSettings({ ...loadAppSettings(), collapseThreshold });
  }, [collapseThreshold]);

  useEffect(() => {
    saveAppSettings({ ...loadAppSettings(), sidebarCollapsed });
  }, [sidebarCollapsed]);

  useEffect(() => {
    saveAppSettings({ ...loadAppSettings(), sidebarWidth });
  }, [sidebarWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = sidebarResizeRef.current;
      if (!drag) return;
      const next = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, drag.startWidth + (e.clientX - drag.startX)),
      );
      setSidebarWidth(next);
      graphRef.current?.resize();
    };
    const onUp = () => {
      if (!sidebarResizeRef.current) return;
      sidebarResizeRef.current = null;
      document.body.classList.remove('sidebar-resizing');
      requestAnimationFrame(() => graphRef.current?.resize());
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.code !== 'KeyF') return;
      // Only from the main scheme view — never over other dialogs/panels.
      const blocked = Boolean(
        detailsId
        || deleteTarget
        || showMetrics
        || showLegend
        || showFlagsCatalog
        || showFlagsManager
        || showFlagConflictsDialog
        || showAddDialog
        || showOrphanWarning
        || showNotifications,
      );
      if (blocked || !scheme) return;
      e.preventDefault();
      if (!showSearch) setShowSearch(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    scheme,
    detailsId,
    deleteTarget,
    showSearch,
    showMetrics,
    showLegend,
    showFlagsCatalog,
    showFlagsManager,
    showFlagConflictsDialog,
    showAddDialog,
    showOrphanWarning,
    showNotifications,
  ]);

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

  const flagConflicts = useMemo(() => {
    if (!scheme) return null;
    if (flagsCatalog.length === 0) return null;
    return runWorldGuardFlagChecks({ scheme, flagsCatalog });
  }, [scheme, flagsCatalog]);

  const conflictRegionIds = useMemo(
    () => (flagConflicts ? flagConflicts.conflictRegionIds : new Set<string>()),
    [flagConflicts],
  );

  const problemBrightIds = useMemo(() => {
    if (!problemFilter || !scheme) return null;
    const ids = new Set<string>();
    if (problemFilter === 'error') {
      for (const c of flagConflicts?.spatialConflicts ?? []) {
        if (!c.ambiguous) continue;
        ids.add(c.aId);
        ids.add(c.bId);
      }
    } else {
      for (const c of flagConflicts?.spatialConflicts ?? []) {
        if (c.ambiguous) continue;
        ids.add(c.aId);
        ids.add(c.bId);
      }
      for (const o of flagConflicts?.overwrites ?? []) {
        ids.add(o.parentId);
        ids.add(o.childId);
      }
      for (const id of orphanIds) ids.add(id);
    }
    return ids;
  }, [problemFilter, scheme, flagConflicts, orphanIds]);

  const subtreeBrightIds = useMemo(() => {
    if (!subtreeHighlightRoot || !scheme) return null;
    if (subtreeHighlightIds) return subtreeHighlightIds;
    const node = findForestNode(scheme, subtreeHighlightRoot);
    if (!node) return new Set([subtreeHighlightRoot]);
    return new Set([subtreeHighlightRoot, ...collectDescendants(node)]);
  }, [subtreeHighlightRoot, subtreeHighlightIds, scheme]);

  const attentionBrightIds = useMemo(() => {
    if (subtreeBrightIds) return subtreeBrightIds;
    if (problemBrightIds) return problemBrightIds;
    return null;
  }, [subtreeBrightIds, problemBrightIds]);

  const attentionBrightEdgeKeys = useMemo(() => {
    if (!scheme || !subtreeBrightIds || !subtreeHighlightMode) return null;
    return collectHighlightEdgeKeys(
      scheme,
      subtreeBrightIds,
      subtreeHighlightMode,
      hiddenNodes,
    );
  }, [scheme, subtreeBrightIds, subtreeHighlightMode, hiddenNodes]);

  const flagHighlight = useMemo(() => {
    if (!scheme || !highlightFlag) return null;
    const base = buildFlagHighlight(scheme, highlightFlag);
    let withConflict = base;
    if (conflictSchemeView && conflictSchemeView.flagName === highlightFlag) {
      withConflict = {
        ...attachConflictInheritancePaths(
          base,
          scheme,
          conflictSchemeView.aId,
          conflictSchemeView.bId,
        ),
        conflictIds: new Set([conflictSchemeView.aId, conflictSchemeView.bId]),
        conflictEdgeKeys: new Set([
          `${conflictSchemeView.relation}-${conflictSchemeView.aId}-${conflictSchemeView.bId}`,
          `${conflictSchemeView.relation}-${conflictSchemeView.bId}-${conflictSchemeView.aId}`,
        ]),
      };
    } else if (overwriteSchemeView && overwriteSchemeView.flagName === highlightFlag) {
      withConflict = {
        ...attachConflictInheritancePaths(
          base,
          scheme,
          overwriteSchemeView.parentId,
          overwriteSchemeView.childId,
        ),
        conflictIds: new Set([overwriteSchemeView.parentId, overwriteSchemeView.childId]),
      };
    }
    return enrichHighlightWithFlagValues(withConflict, scheme, highlightFlag, flagsCatalog);
  }, [scheme, highlightFlag, conflictSchemeView, overwriteSchemeView, flagsCatalog]);

  useEffect(() => {
    if (!scheme) {
      conflictNotifySeededForRef.current = null;
      notifiedConflictKeysRef.current = new Set();
      return;
    }

    const schemeKey = scheme.sourceHash || 'default';
    const spatial = flagConflicts && flagConflicts.hardErrors.length === 0
      ? flagConflicts.spatialConflicts
      : [];
    const overwrites = flagConflicts && flagConflicts.hardErrors.length === 0
      ? flagConflicts.overwrites
      : [];
    const now = Date.now();
    const fresh: AppNotification[] = [];

    const spatialKey = (c: SpatialConflict) =>
      `sp|${c.flagName}|${c.aId}|${c.bId}|${c.relation}`;
    const overwriteKey = (o: { flagName: string; parentId: string; childId: string }) =>
      `ow|${o.flagName}|${o.parentId}|${o.childId}`;
    const orphanKey = (id: string) => `or|${id}`;

    const activeKeys = new Set<string>();
    for (const c of spatial) activeKeys.add(spatialKey(c));
    for (const o of overwrites) activeKeys.add(overwriteKey(o));
    for (const id of orphanIds) activeKeys.add(orphanKey(id));

    // Drop notifications for conflicts that no longer exist; allow re-notify later.
    for (const key of [...notifiedConflictKeysRef.current]) {
      if (!activeKeys.has(key)) notifiedConflictKeysRef.current.delete(key);
    }

    const pushAmbiguous = (c: SpatialConflict, key: string) => {
      fresh.push({
        id: `${key}|${now}`,
        createdAt: now,
        level: 'error',
        kind: 'spatial',
        conflictKey: key,
        title: t('notifications.ambiguousTitle', { flag: c.flagName }),
        body: t('notifications.ambiguousBody', {
          a: c.aId,
          b: c.bId,
          aValue: formatFlagValueShort(c.aValue),
          bValue: formatFlagValueShort(c.bValue),
        }),
        flagName: c.flagName,
        aId: c.aId,
        bId: c.bId,
        relation: c.relation,
        read: false,
      });
    };

    const pushResolved = (c: SpatialConflict, key: string) => {
      fresh.push({
        id: `${key}|${now}`,
        createdAt: now,
        level: 'warning',
        kind: 'spatial',
        conflictKey: key,
        title: t('notifications.resolvedTitle', { flag: c.flagName }),
        body: t('notifications.resolvedBody', {
          a: c.aId,
          b: c.bId,
          aValue: formatFlagValueShort(c.aValue),
          bValue: formatFlagValueShort(c.bValue),
          winner: c.winnerId ?? '?',
        }),
        flagName: c.flagName,
        aId: c.aId,
        bId: c.bId,
        relation: c.relation,
        read: false,
      });
    };

    const pushOverwrite = (
      o: { flagName: string; parentId: string; childId: string; parentValue: unknown; childValue: unknown },
      key: string,
    ) => {
      fresh.push({
        id: `${key}|${now}`,
        createdAt: now,
        level: 'warning',
        kind: 'overwrite',
        conflictKey: key,
        title: t('notifications.overwriteTitle', { flag: o.flagName }),
        body: t('notifications.overwriteBody', {
          child: o.childId,
          childValue: formatFlagValueShort(o.childValue),
          parent: o.parentId,
          parentValue: formatFlagValueShort(o.parentValue),
        }),
        flagName: o.flagName,
        aId: o.parentId,
        bId: o.childId,
        read: false,
      });
    };

    const pushOrphan = (id: string, key: string) => {
      fresh.push({
        id: `${key}|${now}`,
        createdAt: now,
        level: 'warning',
        kind: 'orphan',
        conflictKey: key,
        title: t('notifications.orphanTitle'),
        body: t('notifications.orphanBody', { id }),
        aId: id,
        read: false,
      });
    };

    const isReseed = conflictNotifySeededForRef.current !== schemeKey;

    // First analysis for this scheme: replace bell with errors + overwrites + orphans.
    if (isReseed) {
      conflictNotifySeededForRef.current = schemeKey;
      notifiedConflictKeysRef.current = new Set();
      for (const c of spatial) {
        const key = spatialKey(c);
        notifiedConflictKeysRef.current.add(key);
        if (c.ambiguous) pushAmbiguous(c, key);
      }
      for (const o of overwrites) {
        const key = overwriteKey(o);
        notifiedConflictKeysRef.current.add(key);
        pushOverwrite(o, key);
      }
      for (const id of orphanIds) {
        const key = orphanKey(id);
        notifiedConflictKeysRef.current.add(key);
        pushOrphan(id, key);
      }
    } else {
      // After edits: errors = no winner; warnings = clear-winner overlaps + overwrites + new orphans.
      for (const c of spatial) {
        const key = spatialKey(c);
        if (notifiedConflictKeysRef.current.has(key)) continue;
        notifiedConflictKeysRef.current.add(key);
        if (c.ambiguous) pushAmbiguous(c, key);
        else pushResolved(c, key);
      }
      for (const o of overwrites) {
        const key = overwriteKey(o);
        if (notifiedConflictKeysRef.current.has(key)) continue;
        notifiedConflictKeysRef.current.add(key);
        pushOverwrite(o, key);
      }
      for (const id of orphanIds) {
        const key = orphanKey(id);
        if (notifiedConflictKeysRef.current.has(key)) continue;
        notifiedConflictKeysRef.current.add(key);
        pushOrphan(id, key);
      }
    }

    setNotifications((prev) => {
      if (isReseed) return fresh.slice(0, 100);
      const pruned = prev.filter((n) => !n.conflictKey || activeKeys.has(n.conflictKey));
      if (fresh.length === 0) return pruned;
      return [...fresh, ...pruned].slice(0, 100);
    });

    setConflictSchemeView((current) => {
      if (!current) return current;
      const key = `sp|${current.flagName}|${current.aId}|${current.bId}|${current.relation}`;
      return activeKeys.has(key) ? current : null;
    });
    setOverwriteSchemeView((current) => {
      if (!current) return current;
      const key = `ow|${current.flagName}|${current.parentId}|${current.childId}`;
      return activeKeys.has(key) ? current : null;
    });

    setNotificationToasts((prev) => {
      if (isReseed) return fresh.slice(0, 5);
      const pruned = prev.filter((n) => !n.conflictKey || activeKeys.has(n.conflictKey));
      return fresh.length > 0 ? [...fresh, ...pruned].slice(0, 5) : pruned;
    });
    if (fresh.length > 0) {
      for (const item of fresh) {
        window.setTimeout(() => {
          setNotificationToasts((prev) => prev.filter((toast) => toast.id !== item.id));
        }, 6500);
      }
    }
  }, [flagConflicts, scheme, orphanIds, t]);

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
      // Re-seed bell/toasts for this scheme; drop any previous session entries.
      conflictNotifySeededForRef.current = null;
      setNotifications([]);
      setNotificationToasts([]);
      setHighlightFlag(null);
      setConflictSchemeView(null);
      setOverwriteSchemeView(null);
      setSubtreeHighlightRoot(null);
      setSubtreeHighlightIds(null);
      setSubtreeHighlightMode(null);
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

  const clearCameraRequests = useCallback(() => {
    setFocusRequest(null);
    setCenterRequest(null);
    setFitRequest(null);
    setSelectedId(null);
    setCollapseTarget(null);
    setSubtreeHighlightRoot(null);
    setSubtreeHighlightIds(null);
    setSubtreeHighlightMode(null);
    setProblemFilter(null);
    viewResetSeqRef.current += 1;
    setViewResetRequest({ seq: viewResetSeqRef.current });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setCollapseTarget(null);
  }, []);

  const handleClearApp = useCallback(async () => {
    try {
      await clearSession();
    } catch (err) {
      setStatus(t('status.error', { msg: String(err) }));
      return;
    }
    clearViewState(schemeKeyRef.current);
    schemeKeyRef.current = 'default';
    isFreshSchemeRef.current = false;
    conflictNotifySeededForRef.current = null;
    notifiedConflictKeysRef.current = new Set();

    setScheme(null);
    setSelectedId(null);
    setDetailsId(null);
    setHiddenNodes(new Set());
    setOrphanIds(new Set());
    setShowOrphanWarning(false);
    setShowMetrics(false);
    setShowLegend(false);
    setLegendMode('scheme');
    setShowFlagsCatalog(false);
    setShowSearch(false);
    setShowFlagsManager(false);
    setFlagsManagerFocusId(null);
    setShowFlagConflictsDialog(false);
    setHighlightFlag(null);
    setConflictSchemeView(null);
    setOverwriteSchemeView(null);
    setNotifications([]);
    setNotificationToasts([]);
    setShowNotifications(false);
    setShowAddDialog(false);
    setAddDialogLockedParent(undefined);
    setDeleteTarget(null);
    setDeletableRegionIds(new Set());
    setCollapseTarget(null);
    setGraphLocked(true);
    setLoadedYamlHash(null);
    setHasPendingYaml(false);
    setHashWarning(null);
    setFocusRequest(null);
    setCenterRequest(null);
    setFitRequest(null);
    setViewResetRequest(null);
    setProblemFilter(null);
    setShowProblemsMenu(false);
    setSubtreeHighlightRoot(null);
    setSubtreeHighlightIds(null);
    setSubtreeHighlightMode(null);
    setEdgeDisplayMode('all');
    setShowEdgeModeMenu(false);
    setShowClearConfirm(false);
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    }
    setStatus(t('status.appCleared'));
  }, [t]);

  const requestFitOnIds = useCallback((ids: string[]) => {
    fitSeqRef.current += 1;
    setCenterRequest(null);
    setFocusRequest(null);
    setFitRequest({ ids, seq: fitSeqRef.current });
  }, []);

  const highlightSubtree = useCallback((regionId: string, mode: HighlightBranchMode = 'children') => {
    if (!scheme) return;
    let ids: string[];
    if (mode === 'full') {
      const node = findForestNode(scheme, regionId);
      const descendants = node ? collectDescendants(node) : [];
      ids = [regionId, ...descendants, ...collectParentChain(scheme, regionId)];
    } else if (mode === 'containment-all') {
      ids = collectContainmentChain(scheme, regionId, 'all');
    } else if (mode === 'containment-children') {
      ids = collectContainmentChain(scheme, regionId, 'children');
    } else if (mode === 'containment-parents') {
      ids = collectContainmentChain(scheme, regionId, 'parents');
    } else if (mode === 'intersects') {
      ids = collectIntersectsPartners(scheme, regionId);
    } else {
      const node = findForestNode(scheme, regionId);
      ids = node ? [regionId, ...collectDescendants(node)] : [regionId];
    }

    // Only the clicked region — no related nodes for this mode.
    if (ids.length <= 1) {
      const emptyKey =
        mode === 'full' ? 'status.subtreeHighlightEmptyFull'
        : mode === 'children' ? 'status.subtreeHighlightEmptyChildren'
        : mode === 'intersects' ? 'status.subtreeHighlightEmptyIntersects'
        : mode === 'containment-all' ? 'status.subtreeHighlightEmptyContainment'
        : mode === 'containment-children' ? 'status.subtreeHighlightEmptyContainmentChildren'
        : mode === 'containment-parents' ? 'status.subtreeHighlightEmptyContainmentParents'
        : 'status.subtreeHighlightEmpty';
      const title = t('status.subtreeHighlightEmptyTitle');
      const body = t(emptyKey, { id: regionId });
      setStatus(body);
      const toast: AppNotification = {
        id: `info|highlight-empty|${Date.now()}`,
        createdAt: Date.now(),
        level: 'warning',
        kind: 'info',
        conflictKey: `info|highlight-empty|${regionId}|${mode}`,
        title,
        body,
        aId: regionId,
        read: false,
      };
      setNotificationToasts((prev) => [...prev, toast]);
      return;
    }

    // Drop any other special highlight so branch mode always wins.
    setHighlightFlag(null);
    setConflictSchemeView(null);
    setOverwriteSchemeView(null);
    setProblemFilter(null);
    setShowProblemsMenu(false);
    setSubtreeHighlightRoot(regionId);
    setSubtreeHighlightIds(new Set(ids));
    setSubtreeHighlightMode(mode);
    setSelectedId(regionId);
    setCollapseTarget(regionId);
    requestFitOnIds(ids);
    setStatus(t('status.subtreeHighlight', { id: regionId }));
  }, [scheme, requestFitOnIds, t]);

  const clearSpecialHighlight = useCallback(() => {
    setHighlightFlag(null);
    setConflictSchemeView(null);
    setOverwriteSchemeView(null);
    setSubtreeHighlightRoot(null);
    setSubtreeHighlightIds(null);
    setSubtreeHighlightMode(null);
    setFitRequest(null);
    setStatus(t('status.specialHighlightCleared'));
  }, [t]);

  const clearSubtreeHighlight = useCallback(() => {
    setSubtreeHighlightRoot(null);
    setSubtreeHighlightIds(null);
    setSubtreeHighlightMode(null);
    setFitRequest(null);
    setStatus(t('status.subtreeHighlightCleared'));
  }, [t]);

  const setProblemsMode = useCallback((mode: 'error' | 'warning' | null) => {
    setHighlightFlag(null);
    setConflictSchemeView(null);
    setOverwriteSchemeView(null);
    setSubtreeHighlightRoot(null);
    setSubtreeHighlightIds(null);
    setSubtreeHighlightMode(null);
    setShowProblemsMenu(false);
    setProblemFilter(mode);
    if (mode === 'error') setStatus(t('status.problemsErrors'));
    else if (mode === 'warning') setStatus(t('status.problemsWarnings'));
    else {
      setStatus(t('status.problemsOff'));
      return;
    }
    if (!scheme) return;
    const ids = new Set<string>();
    if (mode === 'error') {
      for (const c of flagConflicts?.spatialConflicts ?? []) {
        if (!c.ambiguous) continue;
        ids.add(c.aId);
        ids.add(c.bId);
      }
    } else {
      for (const c of flagConflicts?.spatialConflicts ?? []) {
        if (c.ambiguous) continue;
        ids.add(c.aId);
        ids.add(c.bId);
      }
      for (const o of flagConflicts?.overwrites ?? []) {
        ids.add(o.parentId);
        ids.add(o.childId);
      }
      for (const id of orphanIds) ids.add(id);
    }
    if (ids.size > 0) requestFitOnIds(Array.from(ids));
  }, [t, scheme, flagConflicts, orphanIds, requestFitOnIds]);

  const focusRegion = useCallback((regionId: string) => {
    if (!scheme) return;
    const parentMap = buildParentMap(scheme.regions);
    setHiddenNodes((prev) => revealPathToNode(regionId, prev, parentMap));
    setSelectedId(regionId);
    setCollapseTarget(regionId);
    // Focus must win over a stale expand/collapse centerRequest.
    setCenterRequest(null);
    setFitRequest(null);
    focusSeqRef.current += 1;
    setFocusRequest({ id: regionId, seq: focusSeqRef.current });
  }, [scheme]);

  const openNotificationOnScheme = useCallback((n: AppNotification) => {
    setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)));
    setNotificationToasts((prev) => prev.filter((item) => item.id !== n.id));
    setShowNotifications(false);
    setShowFlagConflictsDialog(false);
    setShowFlagsManager(false);
    setFlagsManagerFocusId(null);

    if (n.kind === 'info') {
      if (n.aId) focusRegion(n.aId);
      return;
    }

    // Reset previous special highlight before applying this one.
    setSubtreeHighlightRoot(null);
    setSubtreeHighlightIds(null);
    setSubtreeHighlightMode(null);
    setProblemFilter(null);
    setShowProblemsMenu(false);

    if (n.kind === 'orphan' && n.aId) {
      setHighlightFlag(null);
      setConflictSchemeView(null);
      setOverwriteSchemeView(null);
      focusRegion(n.aId);
      return;
    }

    if (n.flagName) setHighlightFlag(n.flagName);

    if (n.kind === 'spatial' && n.aId && n.bId) {
      setOverwriteSchemeView(null);
      const fromList = flagConflicts?.spatialConflicts.find(
        (c) => c.flagName === n.flagName
          && c.aId === n.aId
          && c.bId === n.bId
          && c.relation === n.relation,
      );
      if (fromList) {
        setConflictSchemeView(fromList);
      } else if (n.flagName && n.relation) {
        setConflictSchemeView({
          flagName: n.flagName,
          relation: n.relation,
          aId: n.aId,
          bId: n.bId,
          aPriority: 0,
          bPriority: 0,
          aValue: undefined,
          bValue: undefined,
          winnerId: undefined,
          winnerValue: undefined,
          ambiguous: n.level === 'error',
          commonAncestorId: null,
        });
      }
      const parentMap = scheme ? buildParentMap(scheme.regions) : null;
      if (parentMap) {
        setHiddenNodes((prev) => {
          let next = revealPathToNode(n.aId!, prev, parentMap);
          next = revealPathToNode(n.bId!, next, parentMap);
          return next;
        });
      }
      setSelectedId(n.aId);
      setCollapseTarget(n.aId);
      requestFitOnIds([n.aId, n.bId]);
      return;
    }

    if (n.kind === 'overwrite' && n.aId && n.bId && n.flagName) {
      setConflictSchemeView(null);
      setOverwriteSchemeView({
        flagName: n.flagName,
        parentId: n.aId,
        childId: n.bId,
      });
      const parentMap = scheme ? buildParentMap(scheme.regions) : null;
      if (parentMap) {
        setHiddenNodes((prev) => {
          let next = revealPathToNode(n.aId!, prev, parentMap);
          next = revealPathToNode(n.bId!, next, parentMap);
          return next;
        });
      }
      setSelectedId(n.bId);
      setCollapseTarget(n.bId);
      requestFitOnIds([n.aId, n.bId]);
    }
  }, [flagConflicts, scheme, requestFitOnIds]);

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
      setHasPendingYaml(true);

      // Keep the current scheme on screen; only auto-build when nothing is shown yet.
      if (scheme) {
        setStatus(
          `${t('status.loaded', { count: preview.count, path: preview.source_path })} | ${t('status.yamlPendingRebuild')}`,
        );
      } else {
        setStatus(t('status.building'));
        clearCameraRequests();
        const result = await buildScheme();
        const collapsed = applyScheme(result.scheme, true, collapseThreshold);
        setHasPendingYaml(false);
        setHashWarning(null);
        let msg = t('status.schemeReady', {
          nodes: result.scheme.regions.length,
          edges: result.scheme.spatialEdges.length,
        });
        if (collapsed > 0) {
          msg += t('status.autoCollapsed', { count: collapsed, threshold: collapseThreshold });
        }
        setStatus(`${t('status.loaded', { count: preview.count, path: preview.source_path })} | ${msg}`);
      }
    } catch (err) {
      setStatus(t('status.error', { msg: String(err) }));
    }
    e.target.value = '';
  };

  const handleBuild = async () => {
    try {
      setStatus(t('status.building'));
      // Drop stale search focus so the new scheme fits overview + orphan warning.
      clearCameraRequests();
      const result = await buildScheme();
      const collapsed = applyScheme(result.scheme, true, collapseThreshold);
      setHasPendingYaml(false);
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
    if (!scheme) return;
    try {
      const text = JSON.stringify(scheme, null, 2);
      const name = await saveTextWithDialog(text, 'scheme.mrv.json');
      setStatus(t('status.schemeSaved', { path: name }));
    } catch (err) {
      if (isUserCancelled(err)) return;
      setStatus(t('status.error', { msg: String(err) }));
    }
  };

  const handleLoadScheme = async () => {
    try {
      const picked = await openTextFileWithDialog();
      if (!picked) return;
      let parsed: Scheme;
      try {
        parsed = JSON.parse(picked.text) as Scheme;
      } catch {
        setStatus(t('status.error', { msg: t('status.schemeInvalidJson') }));
        return;
      }
      clearCameraRequests();
      const loaded = await importScheme(parsed);
      const collapsed = applyScheme(loaded, true, collapseThreshold);
      setHasPendingYaml(false);

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
      if (isUserCancelled(err)) return;
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
  }, [scheme]);

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
  }, [scheme]);

  const handleCollapseAll = useCallback(() => {
    if (!scheme) return;
    setHiddenNodes(computeCollapseAllHidden(scheme));
    setStatus(t('status.collapseAll'));
  }, [scheme, t]);

  const handleExpandAll = useCallback(() => {
    setHiddenNodes(computeExpandAllHidden());
    setStatus(t('status.expandAll'));
  }, [t]);

  const handleExpandThreshold = useCallback(() => {
    if (!scheme) return;
    setHiddenNodes(computeDefaultHiddenNodes(scheme, collapseThreshold));
    setStatus(t('status.expandThreshold', { threshold: collapseThreshold }));
  }, [scheme, collapseThreshold, t]);

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
    geometry: {
      type: string;
      min?: { x: number; y: number; z: number };
      max?: { x: number; y: number; z: number };
      min_y?: number;
      max_y?: number;
      points?: { x: number; z: number }[];
    };
  }) => {
    try {
      await addManualRegion({
        id: data.id,
        parent: data.parent,
        priority: data.priority,
        flags: data.flags,
        type: data.geometry.type as RegionData['type'],
        min: data.geometry.min,
        max: data.geometry.max,
        min_y: data.geometry.min_y,
        max_y: data.geometry.max_y,
        points: data.geometry.points,
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
      setCenterRequest(null);
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

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setNotificationToasts((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const dismissAllToasts = useCallback(() => {
    setNotificationToasts([]);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (err) {
      setStatus(t('status.error', { msg: String(err) }));
    }
  }, [t]);

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    sync();
    return () => document.removeEventListener('fullscreenchange', sync);
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

  const onContextCollapseRecursive = useCallback((id: string, hide: boolean) => {
    setCollapseTarget(id);
    setSelectedId(id);
    toggleRecursive(id, hide);
  }, [toggleRecursive]);

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

  const handleUpdateFlags = useCallback(async (
    regionId: string,
    flags: Record<string, unknown>,
  ) => {
    await updateRegionFlags(regionId, flags);
    setScheme((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        regions: prev.regions.map((r) =>
          r.id === regionId ? { ...r, flags } : r,
        ),
      };
    });
    setStatus(t('status.flagsUpdated', { id: regionId }));
  }, [t]);

  const handleUpdateParent = useCallback(async (
    regionId: string,
    parent: string | null,
  ) => {
    await updateRegionParent(regionId, parent);
    const result = await buildScheme();
    applyScheme(result.scheme, false, collapseThreshold);
    setStatus(t('status.parentUpdated', { id: regionId }));
  }, [t, applyScheme, collapseThreshold]);

  const handleUpdateGeometry = useCallback(async (
    regionId: string,
    payload: {
      type: string;
      min?: { x: number; y: number; z: number };
      max?: { x: number; y: number; z: number };
      min_y?: number;
      max_y?: number;
      points?: { x: number; z: number }[];
    },
  ) => {
    await updateRegionGeometry(regionId, payload);
    const result = await buildScheme();
    applyScheme(result.scheme, false, collapseThreshold);
    setStatus(t('status.geometryUpdated', { id: regionId }));
  }, [t, applyScheme, collapseThreshold]);

  const openFlagsManager = useCallback((regionId?: string) => {
    setFlagsManagerFocusId(regionId ?? null);
    setShowFlagsManager(true);
  }, []);

  const closeFlagsManager = useCallback(() => {
    setShowFlagsManager(false);
    setFlagsManagerFocusId(null);
  }, []);

  const handleBulkFlags = useCallback(async (payload: {
    flag: string;
    action: 'delete' | 'update';
    value?: unknown;
    regionIds: string[] | null;
  }) => {
    const result = await bulkUpdateFlags({
      flag: payload.flag,
      action: payload.action,
      value: payload.value,
      region_ids: payload.regionIds,
    });
    const updatedSet = new Set(result.updated);
    setScheme((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        regions: prev.regions.map((r) => {
          if (!updatedSet.has(r.id)) return r;
          const flags = { ...r.flags };
          if (payload.action === 'delete') {
            delete flags[payload.flag];
          } else if (payload.value !== undefined) {
            flags[payload.flag] = payload.value;
          }
          return { ...r, flags };
        }),
      };
    });
    setStatus(t('status.flagsBulkUpdated', { count: result.count, flag: payload.flag }));
    return { count: result.count };
  }, [t]);

  const handleExportRegionsYaml = useCallback(async () => {
    if (!scheme || !flagConflicts) return;
    if (flagConflicts.hardErrors.length > 0) {
      setStatus(t('status.exportBlocked', { msg: flagConflicts.hardErrors[0] }));
      return;
    }

    const includeManual = window.confirm(t('status.exportAskManual'));
    if (includeManual) {
      const incomplete = scheme.regions
        .filter((r) => isTemporaryRegion(r) && r.type !== 'global' && r.type !== 'manual')
        .filter((r) => {
          if (r.type === 'cuboid') {
            return !(r.min && r.max);
          }
          if (r.type === 'poly2d') {
            return !(r.points && r.points.length >= 3 && r.min_y != null && r.max_y != null);
          }
          return false;
        })
        .map((r) => r.id);
      if (incomplete.length > 0) {
        setStatus(t('status.exportManualIncomplete', { ids: incomplete.join(', ') }));
        return;
      }
    }

    try {
      const yamlText = await exportRegionsYaml(includeManual);

      const blob = new Blob([yamlText], { type: 'text/yaml' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = 'regions.export.yml';
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);

      if (flagConflicts.warningSummary.totalCount > 0) {
        setStatus(
          t('status.exportedWithConflicts', {
            ambiguous: flagConflicts.warningSummary.spatialAmbiguousCount,
          }),
        );
      } else {
        setStatus(t('status.exported'));
      }
    } catch (err) {
      setStatus(t('status.error', { msg: String(err) }));
    }
  }, [scheme, flagConflicts, t]);

  const downloadText = (text: string, filename: string, type = 'application/json') => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const buildButton = !scheme
    ? { label: t('app.buildScheme'), icon: '▶' }
    : hasPendingYaml
      ? { label: t('app.rebuildScheme'), icon: '↻' }
      : { label: t('app.updateScheme'), icon: '⟳' };

  const blockBrowserMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <div className="app">
      <aside
        className={`toolbar${sidebarCollapsed ? ' toolbar--collapsed' : ''}`}
        style={sidebarCollapsed ? undefined : { width: sidebarWidth, flexBasis: sidebarWidth }}
      >
        {!sidebarCollapsed && (
          <div
            className="sidebar-resize-handle"
            title={t('app.resizeSidebar')}
            onMouseDown={(e) => {
              e.preventDefault();
              sidebarResizeRef.current = { startX: e.clientX, startWidth: sidebarWidth };
              document.body.classList.add('sidebar-resizing');
            }}
          />
        )}
        <button
          type="button"
          className="sidebar-toggle icon-btn"
          onClick={() => {
            setSidebarCollapsed((value) => !value);
            // Let flex layout settle, then resize Cytoscape canvas.
            requestAnimationFrame(() => {
              requestAnimationFrame(() => graphRef.current?.resize());
            });
          }}
          title={t(sidebarCollapsed ? 'app.expandSidebar' : 'app.collapseSidebar')}
        >
          {sidebarCollapsed ? '»' : '«'}
        </button>
        {!sidebarCollapsed && <>
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

        <section className="toolbar-section">
        <label className="file-btn">
          <span aria-hidden>📂 </span>{t('app.openYaml')}
          <input type="file" accept=".yml,.yaml" onChange={handleYamlUpload} hidden />
        </label>
        <button type="button" className="primary" onClick={handleBuild}><span aria-hidden>{buildButton.icon} </span>{buildButton.label}</button>
        <button type="button" onClick={handleLoadScheme}><span aria-hidden>↥ </span>{t('app.loadScheme')}</button>
        <button type="button" onClick={handleSaveScheme} disabled={!scheme}><span aria-hidden>💾 </span>{t('app.saveScheme')}</button>
        </section>
        <section className="toolbar-section">
        <button type="button" onClick={() => openFlagsManager()} disabled={!scheme}>
          <span aria-hidden>⚑ </span>{t('app.flagsManager')}
        </button>
        <button type="button" onClick={() => setShowFlagsCatalog(true)}><span aria-hidden>☷ </span>{t('app.flagsCatalog')}</button>
        </section>
        <section className="toolbar-section">
        <button
          type="button"
          onClick={() => setShowFlagConflictsDialog(true)}
          disabled={!scheme || flagsCatalog.length === 0}
        >
          <span aria-hidden>⚠ </span>{t('app.analyzeFlagConflicts')}
        </button>
        <button
          type="button"
          onClick={() => handleExportRegionsYaml()}
          disabled={!scheme || flagsCatalog.length === 0}
        >
          <span aria-hidden>⇩ </span>{t('app.exportRegionsYml')}
        </button>
        <button type="button" onClick={() => setShowMetrics(true)} disabled={!scheme}>
          <span aria-hidden>▥ </span>{t('app.metrics')}
        </button>
        </section>

        <div className="settings-block">
          <p className="depth-scale-title">{t('app.autoCollapse')}</p>
          <p className="depth-scale-hint">{t('app.autoCollapseHint')}</p>
          <label className="threshold-control">
            <span className="threshold-control-label">
              {t('app.threshold')}:{' '}
              <span className="threshold-value">{collapseThreshold}</span>
            </span>
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

        {highlightFlag && (
          <p className="hash-warning flag-highlight-banner">
            {t('flagConflicts.highlightActive', { flag: highlightFlag })}
            {conflictSchemeView && (
              <>
                {' · '}
                {t('flagConflicts.conflictViewActive', {
                  a: conflictSchemeView.aId,
                  b: conflictSchemeView.bId,
                })}
              </>
            )}
            {overwriteSchemeView && (
              <>
                {' · '}
                {t('flagConflicts.overwriteViewActive', {
                  parent: overwriteSchemeView.parentId,
                  child: overwriteSchemeView.childId,
                })}
              </>
            )}
          </p>
        )}

        {flagConflicts && flagConflicts.hardErrors.length > 0 && (
          <p
            className="hash-warning"
            style={{ background: '#f8d7da', borderColor: '#842029', color: '#842029' }}
          >
            {t('flagConflicts.hardError', { msg: flagConflicts.hardErrors[0] })}
          </p>
        )}

        <p className="status">{status}</p>
        <p className="hint">{t('app.hint')}</p>
        <div className="sidebar-footer">
          <button type="button" className="danger" onClick={() => setShowClearConfirm(true)}>
            {t('app.clearScheme')}
          </button>
        </div>
        </>}
      </aside>

      {showClearConfirm && (
        <div className="modal-overlay" onClick={() => setShowClearConfirm(false)}>
          <div className="modal clear-scheme-modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>{t('app.clearScheme')}</h2>
              <button type="button" onClick={() => setShowClearConfirm(false)}>×</button>
            </header>
            <div className="modal-body">
              <p>{t('app.clearSchemeConfirm')}</p>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowClearConfirm(false)}>
                  {t('app.no')}
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => { void handleClearApp(); }}
                >
                  {t('app.yes')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
              fitRequest={fitRequest}
              viewResetRequest={viewResetRequest}
              deletableRegionIds={deletableRegionIds}
              locked={graphLocked}
              conflictRegionIds={conflictRegionIds}
              flagHighlight={flagHighlight}
              attentionBrightIds={attentionBrightIds}
              attentionBrightEdgeKeys={attentionBrightEdgeKeys}
              subtreeHighlightActive={Boolean(subtreeHighlightRoot)}
              edgeDisplayMode={edgeDisplayMode}
              onNodeSelect={onNodeSelect}
              onNodeOpen={onNodeOpen}
              onBackgroundTap={clearSelection}
              onCopyName={onCopyName}
              onAddDescendant={onAddDescendant}
              onDeleteManual={requestDeleteManual}
              onOpenFlagsManager={(id) => openFlagsManager(id)}
              onCollapseChildren={(id) => onContextCollapse(id, true)}
              onExpandChildren={(id) => onContextCollapse(id, false)}
              onCollapseRecursive={(id) => onContextCollapseRecursive(id, true)}
              onExpandRecursive={(id) => onContextCollapseRecursive(id, false)}
              onHighlightSubtree={highlightSubtree}
              onClearSubtreeHighlight={clearSubtreeHighlight}
            />
            {collapseTarget && (
              <button
                type="button"
                className="graph-selected-label"
                title={t('app.selectedLabelHint', { id: collapseTarget })}
                onClick={() => focusRegion(collapseTarget)}
              >
                {t('app.selectedLabel', { id: collapseTarget })}
              </button>
            )}
            <div className="graph-map-controls graph-map-controls--top-left">
              <button type="button" className="graph-ctrl-btn" onClick={() => openAddDialog()} title={t('app.addManual')}>
                <IconAdd />
              </button>
            </div>
            <div className="graph-map-controls graph-map-controls--top-right">
              <button
                type="button"
                className="graph-ctrl-btn"
                onClick={handleExpandAll}
                title={t('app.expandAll')}
              >
                <IconExpandAll />
              </button>
              <button
                type="button"
                className="graph-ctrl-btn"
                onClick={handleCollapseAll}
                title={t('app.collapseAll')}
              >
                <IconCollapseAll />
              </button>
              <button
                type="button"
                className="graph-ctrl-btn"
                onClick={handleExpandThreshold}
                title={t('app.expandThreshold')}
              >
                <IconExpandThreshold />
              </button>
              <button type="button" className="graph-ctrl-btn" onClick={() => setShowSearch(true)} title={t('app.search')}>
                <IconSearch />
              </button>
              <NotificationsBell
                open={showNotifications}
                notifications={notifications}
                onToggle={() => setShowNotifications((v) => !v)}
                onClose={() => setShowNotifications(false)}
                onMarkAllRead={() => {
                  setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
                }}
                onClear={() => {
                  setNotifications((prev) => prev.filter((n) => n.level !== 'warning'));
                  setNotificationToasts((prev) => prev.filter((n) => n.level !== 'warning'));
                }}
                onDismiss={dismissNotification}
                onOpenItem={openNotificationOnScheme}
              />
            </div>
            <div className="graph-map-controls graph-map-controls--bottom-left">
              <button
                type="button"
                className={`graph-ctrl-btn${graphLocked ? ' graph-ctrl-btn--active' : ''}`}
                onClick={() => setGraphLocked((value) => !value)}
                title={t(graphLocked ? 'graph.unlock' : 'graph.lock')}
                aria-pressed={graphLocked}
              >
                {graphLocked ? <IconLock /> : <IconUnlock />}
              </button>
              <button
                type="button"
                className="graph-ctrl-btn"
                onClick={() => { setLegendMode('scheme'); setShowLegend(true); }}
                title={t('app.legend')}
              >
                <IconLegend />
              </button>
              {highlightFlag && (
                <button
                  type="button"
                  className="graph-ctrl-btn"
                  onClick={() => { setLegendMode('flagHighlight'); setShowLegend(true); }}
                  title={t('legend.flagTitle')}
                >
                  <IconLegend />
                  <span className="graph-ctrl-badge">⚑</span>
                </button>
              )}
              <div className="graph-problems-root" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className={`graph-ctrl-btn${problemFilter ? ' graph-ctrl-btn--warn-active' : ''}`}
                  onClick={() => setShowProblemsMenu((v) => !v)}
                  title={t('app.problemsMode')}
                  aria-pressed={Boolean(problemFilter)}
                  aria-expanded={showProblemsMenu}
                >
                  <IconWarning />
                </button>
                {showProblemsMenu && (
                  <div className="graph-problems-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      className={problemFilter === 'error' ? 'active' : ''}
                      onClick={() => setProblemsMode(problemFilter === 'error' ? null : 'error')}
                    >
                      {t('app.problemsErrors')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className={problemFilter === 'warning' ? 'active' : ''}
                      onClick={() => setProblemsMode(problemFilter === 'warning' ? null : 'warning')}
                    >
                      {t('app.problemsWarnings')}
                    </button>
                    {problemFilter && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => setProblemsMode(null)}
                      >
                        {t('app.problemsOff')}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="graph-problems-root" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className={`graph-ctrl-btn${edgeDisplayMode !== 'all' ? ' graph-ctrl-btn--active' : ''}`}
                  onClick={() => setShowEdgeModeMenu((v) => !v)}
                  title={t('app.edgeDisplayMode')}
                  aria-pressed={edgeDisplayMode !== 'all'}
                  aria-expanded={showEdgeModeMenu}
                >
                  <IconEdgeFilter />
                </button>
                {showEdgeModeMenu && (
                  <div className="graph-problems-menu" role="menu">
                    {(
                      [
                        ['all', 'app.edgeModeAll'],
                        ['intersects', 'app.edgeModeIntersects'],
                        ['contains', 'app.edgeModeContains'],
                        ['spatial', 'app.edgeModeSpatial'],
                        ['hierarchy', 'app.edgeModeHierarchy'],
                      ] as const
                    ).map(([mode, key]) => (
                      <button
                        key={mode}
                        type="button"
                        role="menuitem"
                        className={edgeDisplayMode === mode ? 'active' : ''}
                        onClick={() => {
                          setEdgeDisplayMode(mode);
                          setShowEdgeModeMenu(false);
                          setStatus(t(key));
                        }}
                      >
                        {t(key)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {(highlightFlag || subtreeHighlightRoot) && (
                <button
                  type="button"
                  className="graph-ctrl-btn"
                  onClick={clearSpecialHighlight}
                  title={t('app.clearSpecialHighlight')}
                  aria-label={t('app.clearSpecialHighlight')}
                >
                  <IconClearHighlight />
                </button>
              )}
            </div>
            <div className="graph-map-controls graph-map-controls--bottom-right">
              <button type="button" className="graph-ctrl-btn" onClick={() => graphRef.current?.zoomIn()} title={t('graph.zoomIn')}>
                <IconZoomIn />
              </button>
              <button type="button" className="graph-ctrl-btn" onClick={() => graphRef.current?.zoomOut()} title={t('graph.zoomOut')}>
                <IconZoomOut />
              </button>
              <button
                type="button"
                className={`graph-ctrl-btn${isFullscreen ? ' graph-ctrl-btn--active' : ''}`}
                onClick={() => { void toggleFullscreen(); }}
                title={t(isFullscreen ? 'graph.fullscreenExit' : 'graph.fullscreen')}
                aria-pressed={isFullscreen}
              >
                {isFullscreen ? <IconFullscreenExit /> : <IconFullscreen />}
              </button>
            </div>
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
          regionIds={regionIdList}
          onClose={() => setDetailsId(null)}
          onFocusRegion={focusRegion}
          onCopyName={onCopyName}
          onDeleteManual={requestDeleteManual}
          canDelete={deletableRegionIds.has(detailsRegion.id)}
          onUpdateParent={handleUpdateParent}
          onUpdateFlags={handleUpdateFlags}
          onUpdateGeometry={handleUpdateGeometry}
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
      {showLegend && (
        <LegendPanel mode={legendMode} onClose={() => setShowLegend(false)} />
      )}
      {showSearch && scheme && (
        <SearchPanel
          regionIds={regionIdList}
          onClose={() => setShowSearch(false)}
          onSelect={focusRegion}
        />
      )}
      {showFlagsManager && scheme && (
        <FlagsManagerDialog
          key={flagsManagerFocusId ?? 'flags-manager'}
          scheme={scheme}
          flagsCatalog={flagsCatalog}
          onClose={closeFlagsManager}
          onSave={handleUpdateFlags}
          onBulk={handleBulkFlags}
          highlightFlag={highlightFlag}
          onHighlightFlag={(name) => {
            setSubtreeHighlightRoot(null);
            setSubtreeHighlightIds(null);
            setSubtreeHighlightMode(null);
            setProblemFilter(null);
            setHighlightFlag(name);
            if (!name) {
              setConflictSchemeView(null);
              setOverwriteSchemeView(null);
            }
          }}
          onOpenCatalog={() => setShowFlagsCatalog(true)}
          initialRegionId={flagsManagerFocusId}
        />
      )}
      {showFlagsCatalog && (
        <FlagsCatalogDialog
          scheme={scheme}
          flagsCatalog={flagsCatalog}
          onClose={() => setShowFlagsCatalog(false)}
          onAdd={async (payload) => { await addCustomFlag(payload); setFlagsCatalog(await fetchFlags()); }}
          onDelete={async (name) => { await deleteCustomFlag(name); setFlagsCatalog(await fetchFlags()); setScheme((current) => current ? { ...current, regions: current.regions.map((region) => { const flags = { ...region.flags }; delete flags[name]; return { ...region, flags }; }) } : current); }}
          onDeleteAll={async () => { await deleteAllCustomFlags(); setFlagsCatalog(await fetchFlags()); setScheme((current) => current ? { ...current, regions: current.regions.map((region) => { const flags = { ...region.flags }; flagsCatalog.filter((flag) => flag.builtin === false).forEach((flag) => delete flags[flag.name]); return { ...region, flags }; }) } : current); }}
          onImport={async (file) => { await importCustomFlags(file); setFlagsCatalog(await fetchFlags()); }}
          onExport={async () => downloadText(await exportCustomFlags(), 'custom_flags.json')}
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

      {showFlagConflictsDialog && scheme && flagConflicts && (
        <FlagConflictsDialog
          result={flagConflicts}
          flagsCatalog={flagsCatalog}
          onClose={() => setShowFlagConflictsDialog(false)}
          onFocusRegion={(id) => {
            focusRegion(id);
          }}
          onShowSpatialOnScheme={(conflict) => {
            setShowFlagConflictsDialog(false);
            closeFlagsManager();
            setSubtreeHighlightRoot(null);
            setSubtreeHighlightIds(null);
            setSubtreeHighlightMode(null);
            setProblemFilter(null);
            setOverwriteSchemeView(null);
            setConflictSchemeView(conflict);
            setHighlightFlag(conflict.flagName);
            const parentMap = buildParentMap(scheme.regions);
            setHiddenNodes((prev) => {
              let next = revealPathToNode(conflict.aId, prev, parentMap);
              next = revealPathToNode(conflict.bId, next, parentMap);
              return next;
            });
            setSelectedId(conflict.aId);
            setCollapseTarget(conflict.aId);
            requestFitOnIds([conflict.aId, conflict.bId]);
          }}
          onShowOverwriteOnScheme={(overwrite) => {
            setShowFlagConflictsDialog(false);
            closeFlagsManager();
            setSubtreeHighlightRoot(null);
            setSubtreeHighlightIds(null);
            setSubtreeHighlightMode(null);
            setProblemFilter(null);
            setConflictSchemeView(null);
            setOverwriteSchemeView({
              flagName: overwrite.flagName,
              parentId: overwrite.parentId,
              childId: overwrite.childId,
            });
            setHighlightFlag(overwrite.flagName);
            const parentMap = buildParentMap(scheme.regions);
            setHiddenNodes((prev) => {
              let next = revealPathToNode(overwrite.parentId, prev, parentMap);
              next = revealPathToNode(overwrite.childId, next, parentMap);
              return next;
            });
            setSelectedId(overwrite.childId);
            setCollapseTarget(overwrite.childId);
            requestFitOnIds([overwrite.parentId, overwrite.childId]);
          }}
        />
      )}

      {notificationToasts.length > 0 && (
        <div className="notification-toasts" aria-live="polite">
          <div className="notification-toasts-header">
            <button
              type="button"
              className="notification-toasts-dismiss-all"
              title={t('notifications.dismissToasts')}
              aria-label={t('notifications.dismissToasts')}
              onClick={dismissAllToasts}
            >
              ×
            </button>
          </div>
          {notificationToasts.map((toast) => (
            <div
              key={toast.id}
              className={`notification-toast notification-toast--${toast.level}${toast.kind === 'info' ? ' notification-toast--info' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => {
                const sel = window.getSelection();
                if (sel && sel.toString().trim()) return;
                openNotificationOnScheme(toast);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openNotificationOnScheme(toast);
                }
              }}
            >
              <span className="notification-toast-level">
                {toast.kind === 'info'
                  ? t('notifications.tabInfo')
                  : toast.level === 'error'
                    ? t('notifications.tabErrors')
                    : t('notifications.tabWarnings')}
              </span>
              <strong>{toast.title}</strong>
              <span>{toast.body}</span>
              {toast.kind !== 'info' && (
                <span className="notification-toast-hint">{t('notifications.toastHint')}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
