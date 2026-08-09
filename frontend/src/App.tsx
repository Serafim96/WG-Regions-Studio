import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addManualRegion,
  buildScheme,
  bulkUpdateFlags,
  checkForUpdates,
  checkHealth,
  clearAllRegionFlags,
  clearSession,
  clearManualRegions,
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
  renameRegion,
  updateRegionFlags,
  updateRegionGeometry,
  updateRegionMembers,
  updateRegionParent,
  updateRegionPriority,
} from './api';
import { AddRegionDialog } from './components/AddRegionDialog';
import { ConfirmDialog } from './components/ConfirmDialog';
import { DeleteManualRegionDialog, type DeleteChildrenMode } from './components/DeleteManualRegionDialog';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FlagConflictsDialog } from './components/FlagConflictsDialog';
import { FlagsManagerDialog } from './components/FlagsManagerDialog';
import { FlagsCatalogDialog } from './components/FlagsCatalogDialog';
import { ValidationResultDialog } from './components/ValidationResultDialog';
import { FlagTreeDialog } from './components/FlagTreeDialog';
import {
  IconAdd,
  IconAlign,
  IconClearHighlight,
  IconCollapseAll,
  IconEdgeFilter,
  IconExpandAll,
  IconExpandThreshold,
  IconFlag,
  IconFlagHighlightOpts,
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
  DEFAULT_EDGE_DISPLAY_FILTERS,
  type EdgeDisplayFilters,
  type GraphViewHandle,
  type HighlightBranchMode,
} from './components/GraphView';
import { LegendPanel } from './components/LegendPanel';
import { MetricsPanel } from './components/MetricsPanel';
import {
  NotificationsBell,
  type AppNotification,
} from './components/NotificationsBell';
import { RegionPanel } from './components/RegionPanel';
import { RenameRegionDialog } from './components/RenameRegionDialog';
import { SearchPanel } from './components/SearchPanel';
import type { FlagInfo, ForestNode, RegionData, Scheme } from './types';
import {
  buildHierarchyDepthMap,
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
import { collectDeletableRegionIds } from './utils/regions';
import {
  computeCollapseAllHidden,
  computeDefaultHiddenNodes,
  computeExpandAllHidden,
} from './utils/layout';
import { runWorldGuardFlagChecks, type SpatialConflict } from './utils/flagConflicts';
import { isSchemeFileName, isUserCancelled, isYamlFileName, openSchemeOrYamlWithDialog, saveTextWithDialog } from './utils/fileDialog';
import { validateSchemeForYamlExport, type SchemeIssue } from './utils/schemeValidation';
import { attachConflictInheritancePaths, attachFlagConflicts, buildFlagHighlight, enrichHighlightWithFlagValues, mergeConflictInheritancePaths } from './utils/flagTree';
import { compareNatural } from './utils/naturalSort';
import { loadAppSettings, saveAppSettings, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from './utils/settings';
import { dismissUpdateTag, isUpdateTagDismissed } from './utils/updateDismiss';
import { loadViewState, saveViewState, clearViewState } from './utils/viewState';
import { findNonStandardHeightRegionIds } from './utils/worldHeight';
import { useI18n } from './i18n/I18nContext';
import type { TranslationKey } from './i18n/translations';
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

/** Update notices are app-level — keep them when the scheme list is rebuilt. */
function keepUpdateNotifications(list: AppNotification[]): AppNotification[] {
  return list.filter((n) => n.kind === 'update');
}

function rememberDismissedUpdate(n: AppNotification) {
  if (n.kind !== 'update') return;
  const latest = n.params?.latest;
  if (latest != null) dismissUpdateTag(String(latest));
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

/** All nodes lit for a spatial conflict / overwrite (pair + inheritance parents). */
function conflictHighlightFitIds(
  scheme: Scheme,
  flagName: string,
  aId: string,
  bId: string,
): string[] {
  const base = buildFlagHighlight(scheme, flagName);
  const hl = attachConflictInheritancePaths(base, scheme, aId, bId);
  return Array.from(hl.brightIds);
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
  const [detailsNav, setDetailsNav] = useState<{ stack: string[]; index: number } | null>(null);
  const detailsId = detailsNav?.stack[detailsNav.index] ?? null;
  const detailsCanGoBack = Boolean(detailsNav && detailsNav.index > 0);
  const detailsCanGoForward = Boolean(
    detailsNav && detailsNav.index < detailsNav.stack.length - 1,
  );
  const [hiddenNodes, setHiddenNodes] = useState<Set<string>>(new Set());
  const [orphanIds, setOrphanIds] = useState<Set<string>>(new Set());
  const [flagsCatalog, setFlagsCatalog] = useState<FlagInfo[]>([]);
  const [showMetrics, setShowMetrics] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
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
  /** Next notification sync replaces the list but skips toast popups. */
  const quietNotificationReseedRef = useRef(false);
  const [notificationRefreshSeq, setNotificationRefreshSeq] = useState(0);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addDialogInitialParent, setAddDialogInitialParent] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<{
    regionId: string;
    childIds: string[];
    parentId: string | null;
  } | null>(null);
  const [deletableRegionIds, setDeletableRegionIds] = useState<Set<string>>(new Set());
  const [collapseThreshold, setCollapseThreshold] = useState(initialSettings.collapseThreshold);
  const [baseSize] = useState(60);
  const [collapseTarget, setCollapseTarget] = useState<string | null>(null);
  // Always expand the sidebar on app start (ignore last session collapse).
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(initialSettings.sidebarWidth);
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [graphLocked, setGraphLocked] = useState(true);
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
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showOpenFileConfirm, setShowOpenFileConfirm] = useState(false);
  const [showExportManualConfirm, setShowExportManualConfirm] = useState(false);
  const [validationDialog, setValidationDialog] = useState<{
    title: string;
    intro?: string;
    issues: SchemeIssue[];
    okMessage?: string;
  } | null>(null);
  const [showFlagTreeDialog, setShowFlagTreeDialog] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [serverDown, setServerDown] = useState(false);
  const [edgeDisplayFilters, setEdgeDisplayFilters] = useState<EdgeDisplayFilters>(
    DEFAULT_EDGE_DISPLAY_FILTERS,
  );
  const [showEdgeModeMenu, setShowEdgeModeMenu] = useState(false);
  const [flagHighlightShowIntersects, setFlagHighlightShowIntersects] = useState(false);
  const [flagHighlightShowContains, setFlagHighlightShowContains] = useState(false);
  const [flagHighlightShowInheritance, setFlagHighlightShowInheritance] = useState(false);
  const [flagHighlightShowConflicts, setFlagHighlightShowConflicts] = useState(false);
  const [showFlagHighlightOptsMenu, setShowFlagHighlightOptsMenu] = useState(false);
  const [layoutRequest, setLayoutRequest] = useState<{ seq: number } | null>(null);
  const layoutSeqRef = useRef(0);
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
    if (!showFlagHighlightOptsMenu) return;
    const close = () => setShowFlagHighlightOptsMenu(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [showFlagHighlightOptsMenu]);

  useEffect(() => {
    if (!highlightFlag) setShowFlagHighlightOptsMenu(false);
  }, [highlightFlag]);

  /** Bottom-left scheme control menus: only one submenu open at a time. */
  const toggleBottomLeftMenu = useCallback((which: 'flagOpts' | 'edge' | 'problems') => {
    setShowFlagHighlightOptsMenu((open) => (which === 'flagOpts' ? !open : false));
    setShowEdgeModeMenu((open) => (which === 'edge' ? !open : false));
    setShowProblemsMenu((open) => (which === 'problems' ? !open : false));
  }, []);

  useEffect(() => {
    fetchFlags().then(setFlagsCatalog);
    clearPersistedNotifications();
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      const info = await checkForUpdates(ctrl.signal);
      if (ctrl.signal.aborted || !info?.outdated || !info.latest) return;
      if (isUpdateTagDismissed(info.latest)) return;
      const toast: AppNotification = {
        id: `update|${info.latest}|${Date.now()}`,
        createdAt: Date.now(),
        level: 'warning',
        kind: 'update',
        conflictKey: `update|${info.latest}`,
        titleKey: 'notifications.updateTitle',
        bodyKey: 'notifications.updateBody',
        params: { current: info.current, latest: info.latest },
        url: info.html_url,
        read: false,
      };
      setNotifications((prev) => {
        if (prev.some((n) => n.kind === 'update' && n.conflictKey === toast.conflictKey)) return prev;
        const withoutOld = prev.filter((n) => n.kind !== 'update');
        return [toast, ...withoutOld].slice(0, 100);
      });
      setNotificationToasts((prev) => {
        const withoutOld = prev.filter((n) => n.kind !== 'update');
        return [toast, ...withoutOld].slice(0, 5);
      });
      window.setTimeout(() => {
        setNotificationToasts((prev) => prev.filter((item) => item.id !== toast.id));
      }, 20000);
    })();
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let wasDown = false;

    const ping = async () => {
      const ctrl = new AbortController();
      const timeoutId = window.setTimeout(() => ctrl.abort(), 2500);
      try {
        const ok = await checkHealth(ctrl.signal);
        if (cancelled) return;
        const down = !ok;
        if (wasDown && !down) {
          // Soft nudge toward this tab after restart (no new window needed).
          try {
            window.focus();
          } catch {
            /* ignore */
          }
        }
        wasDown = down;
        setServerDown(down);
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    void ping();
    const intervalId = window.setInterval(() => {
      void ping();
    }, 2000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void ping();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  /** While server is down: block app + browser shortcuts (Ctrl+F, F3, …). */
  useEffect(() => {
    if (!serverDown) return;
    const blockKeys = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', blockKeys, true);
    window.addEventListener('keyup', blockKeys, true);
    window.addEventListener('keypress', blockKeys, true);
    return () => {
      window.removeEventListener('keydown', blockKeys, true);
      window.removeEventListener('keyup', blockKeys, true);
      window.removeEventListener('keypress', blockKeys, true);
    };
  }, [serverDown]);

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
        serverDown
        || detailsId
        || deleteTarget
        || showMetrics
        || showLegend
        || showFlagsCatalog
        || showFlagsManager
        || showFlagConflictsDialog
        || showAddDialog
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
    serverDown,
    detailsId,
    deleteTarget,
    showSearch,
    showMetrics,
    showLegend,
    showFlagsCatalog,
    showFlagsManager,
    showFlagConflictsDialog,
    showAddDialog,
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
    return node.children.map((c) => c.id).sort(compareNatural);
  }, [scheme, detailsId]);

  const detailsSpatialRelations = useMemo(() => {
    if (!scheme || !detailsId) {
      return { intersects: [], containedIn: [], contains: [] };
    }
    return getSpatialRelationsGrouped(scheme, detailsId);
  }, [scheme, detailsId]);

  const regionsById = useMemo(() => {
    const map = new Map<string, RegionData>();
    if (!scheme) return map;
    for (const r of scheme.regions) map.set(r.id, r);
    return map;
  }, [scheme]);

  const hierarchyDepthMap = useMemo(
    () => (scheme ? buildHierarchyDepthMap(scheme) : new Map<string, number>()),
    [scheme],
  );

  const regionIdList = useMemo(
    () => (scheme ? scheme.regions.map((r) => r.id).sort(compareNatural) : []),
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

  const nonStandardHeightIds = useMemo(() => {
    if (!scheme) return new Set<string>();
    return new Set(findNonStandardHeightRegionIds(scheme.regions));
  }, [scheme]);

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
      for (const id of nonStandardHeightIds) ids.add(id);
    }
    return ids;
  }, [problemFilter, scheme, flagConflicts, orphanIds, nonStandardHeightIds]);

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
    const base = buildFlagHighlight(scheme, highlightFlag, {
      showInheritance: flagHighlightShowInheritance,
      showContains: flagHighlightShowContains,
      showIntersects: flagHighlightShowIntersects,
      showConflicts: flagHighlightShowConflicts,
    });
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
    } else if (flagHighlightShowConflicts && flagConflicts) {
      withConflict = attachFlagConflicts(
        base,
        flagConflicts.spatialConflicts,
        highlightFlag,
      );
      const pairs = flagConflicts.spatialConflicts
        .filter((c) => c.flagName === highlightFlag)
        .map((c) => ({ aId: c.aId, bId: c.bId }));
      withConflict = mergeConflictInheritancePaths(withConflict, scheme, pairs);
    }
    return enrichHighlightWithFlagValues(withConflict, scheme, highlightFlag, flagsCatalog);
  }, [
    scheme,
    highlightFlag,
    conflictSchemeView,
    overwriteSchemeView,
    flagsCatalog,
    flagHighlightShowInheritance,
    flagHighlightShowContains,
    flagHighlightShowIntersects,
    flagHighlightShowConflicts,
    flagConflicts,
  ]);

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
    const heightKey = (id: string) => `ht|${id}`;

    const activeKeys = new Set<string>();
    for (const c of spatial) activeKeys.add(spatialKey(c));
    for (const o of overwrites) activeKeys.add(overwriteKey(o));
    for (const id of orphanIds) activeKeys.add(orphanKey(id));
    for (const id of nonStandardHeightIds) activeKeys.add(heightKey(id));

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
        titleKey: 'notifications.ambiguousTitle',
        bodyKey: 'notifications.ambiguousBody',
        params: {
          flag: c.flagName,
          a: c.aId,
          b: c.bId,
          aValue: formatFlagValueShort(c.aValue),
          bValue: formatFlagValueShort(c.bValue),
        },
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
        titleKey: 'notifications.resolvedTitle',
        bodyKey: 'notifications.resolvedBody',
        params: {
          flag: c.flagName,
          a: c.aId,
          b: c.bId,
          aValue: formatFlagValueShort(c.aValue),
          bValue: formatFlagValueShort(c.bValue),
          winner: c.winnerId ?? '?',
        },
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
        titleKey: 'notifications.overwriteTitle',
        bodyKey: 'notifications.overwriteBody',
        params: {
          flag: o.flagName,
          child: o.childId,
          childValue: formatFlagValueShort(o.childValue),
          parent: o.parentId,
          parentValue: formatFlagValueShort(o.parentValue),
        },
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
        titleKey: 'notifications.orphanTitle',
        bodyKey: 'notifications.orphanBody',
        params: { id },
        aId: id,
        read: false,
      });
    };

    const pushHeight = (id: string, key: string) => {
      fresh.push({
        id: `${key}|${now}`,
        createdAt: now,
        level: 'warning',
        kind: 'height',
        conflictKey: key,
        titleKey: 'notifications.heightTitle',
        bodyKey: 'notifications.heightBody',
        params: { id },
        aId: id,
        read: false,
      });
    };

    const isReseed = conflictNotifySeededForRef.current !== schemeKey;

    // First analysis for this scheme: replace bell with errors + overwrites + orphans + height.
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
      for (const id of nonStandardHeightIds) {
        const key = heightKey(id);
        notifiedConflictKeysRef.current.add(key);
        pushHeight(id, key);
      }
    } else {
      // After edits: errors = no winner; warnings = overlaps + overwrites + orphans + height.
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
      for (const id of nonStandardHeightIds) {
        const key = heightKey(id);
        if (notifiedConflictKeysRef.current.has(key)) continue;
        notifiedConflictKeysRef.current.add(key);
        pushHeight(id, key);
      }
    }

    setNotifications((prev) => {
      const keep = keepUpdateNotifications(prev);
      if (isReseed) return [...keep, ...fresh].slice(0, 100);
      const pruned = prev.filter(
        (n) => n.kind === 'update' || !n.conflictKey || activeKeys.has(n.conflictKey),
      );
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

    const quiet = quietNotificationReseedRef.current;
    if (quiet) quietNotificationReseedRef.current = false;

    setNotificationToasts((prev) => {
      const keep = keepUpdateNotifications(prev);
      if (quiet) return keep;
      if (isReseed) return [...keep, ...fresh].slice(0, 5);
      const pruned = prev.filter(
        (n) => n.kind === 'update' || !n.conflictKey || activeKeys.has(n.conflictKey),
      );
      return fresh.length > 0 ? [...fresh, ...pruned].slice(0, 5) : pruned;
    });
    if (!quiet && fresh.length > 0) {
      for (const item of fresh) {
        window.setTimeout(() => {
          setNotificationToasts((prev) => prev.filter((toast) => toast.id !== item.id));
        }, 9500);
      }
    }
  }, [flagConflicts, scheme, orphanIds, nonStandardHeightIds, notificationRefreshSeq]);

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

  const applyOrphans = useCallback((next: Scheme) => {
    const orphans = findOrphanRegionIds(next.regions);
    setOrphanIds(new Set(orphans));
  }, []);

  const applyScheme = useCallback((
    next: Scheme,
    fresh: boolean,
    threshold: number,
  ) => {
    isFreshSchemeRef.current = fresh;
    applyOrphans(next);
    if (fresh) {
      // Re-seed bell/toasts for this scheme; drop scheme entries, keep update notice.
      conflictNotifySeededForRef.current = null;
      setNotifications((prev) => keepUpdateNotifications(prev));
      setNotificationToasts((prev) => keepUpdateNotifications(prev));
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
    () => (scheme ? scheme.regions.map((r) => r.id).sort(compareNatural) : []),
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

  const runBusy = useCallback(async (message: string, fn: () => Promise<void>) => {
    setBusyMessage(message);
    try {
      await fn();
    } finally {
      setBusyMessage(null);
    }
  }, []);

  const handleClearApp = useCallback(async () => {
    try {
      await runBusy(t('status.resetting'), async () => {
        await clearSession();
      });
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
    setDetailsNav(null);
    setHiddenNodes(new Set());
    setOrphanIds(new Set());
    setShowMetrics(false);
    setShowLegend(false);
    setShowFlagsCatalog(false);
    setShowSearch(false);
    setShowFlagsManager(false);
    setFlagsManagerFocusId(null);
    setShowFlagConflictsDialog(false);
    setHighlightFlag(null);
    setConflictSchemeView(null);
    setOverwriteSchemeView(null);
    setNotifications((prev) => keepUpdateNotifications(prev));
    setNotificationToasts((prev) => keepUpdateNotifications(prev));
    setShowNotifications(false);
    setShowAddDialog(false);
    setAddDialogInitialParent(undefined);
    setDeleteTarget(null);
    setDeletableRegionIds(new Set());
    setCollapseTarget(null);
    setGraphLocked(true);
    setFocusRequest(null);
    setCenterRequest(null);
    setFitRequest(null);
    setViewResetRequest(null);
    setProblemFilter(null);
    setShowProblemsMenu(false);
    setSubtreeHighlightRoot(null);
    setSubtreeHighlightIds(null);
    setSubtreeHighlightMode(null);
    setEdgeDisplayFilters(DEFAULT_EDGE_DISPLAY_FILTERS);
    setShowEdgeModeMenu(false);
    setFlagHighlightShowIntersects(false);
    setFlagHighlightShowContains(false);
    setFlagHighlightShowInheritance(false);
    setFlagHighlightShowConflicts(false);
    setShowFlagHighlightOptsMenu(false);
    setShowClearConfirm(false);
    setShowResetConfirm(false);
    setRenameTargetId(null);
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    }
    setStatus(t('status.appCleared'));
  }, [runBusy, t]);

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
      const emptyKey: TranslationKey =
        mode === 'full' ? 'status.subtreeHighlightEmptyFull'
        : mode === 'children' ? 'status.subtreeHighlightEmptyChildren'
        : mode === 'intersects' ? 'status.subtreeHighlightEmptyIntersects'
        : mode === 'containment-all' ? 'status.subtreeHighlightEmptyContainment'
        : mode === 'containment-children' ? 'status.subtreeHighlightEmptyContainmentChildren'
        : mode === 'containment-parents' ? 'status.subtreeHighlightEmptyContainmentParents'
        : 'status.subtreeHighlightEmpty';
      setStatus(t(emptyKey, { id: regionId }));
      const toast: AppNotification = {
        id: `info|highlight-empty|${Date.now()}`,
        createdAt: Date.now(),
        level: 'warning',
        kind: 'info',
        conflictKey: `info|highlight-empty|${regionId}|${mode}`,
        titleKey: 'status.subtreeHighlightEmptyTitle',
        bodyKey: emptyKey,
        params: { id: regionId },
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
    setProblemFilter(null);
    setShowProblemsMenu(false);
    setFitRequest(null);
    setFlagHighlightShowIntersects(false);
    setFlagHighlightShowContains(false);
    setFlagHighlightShowInheritance(false);
    setFlagHighlightShowConflicts(false);
    setShowFlagHighlightOptsMenu(false);
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
      for (const id of nonStandardHeightIds) ids.add(id);
    }
    if (ids.size > 0) requestFitOnIds(Array.from(ids));
  }, [t, scheme, flagConflicts, orphanIds, nonStandardHeightIds, requestFitOnIds]);

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

  const closeRegionDetails = useCallback(() => {
    setDetailsNav(null);
  }, []);

  /** Open or navigate the region card; push history when already open. */
  const openRegionDetails = useCallback((regionId: string) => {
    focusRegion(regionId);
    setDetailsNav((prev) => {
      if (!prev) return { stack: [regionId], index: 0 };
      if (prev.stack[prev.index] === regionId) return prev;
      const stack = [...prev.stack.slice(0, prev.index + 1), regionId];
      return { stack, index: stack.length - 1 };
    });
  }, [focusRegion]);

  const detailsNavRef = useRef(detailsNav);
  detailsNavRef.current = detailsNav;

  const goDetailsHistory = useCallback((delta: -1 | 1) => {
    const prev = detailsNavRef.current;
    if (!prev) return;
    const nextIndex = prev.index + delta;
    if (nextIndex < 0 || nextIndex >= prev.stack.length) return;
    const id = prev.stack[nextIndex];
    setDetailsNav({ ...prev, index: nextIndex });
    focusRegion(id);
  }, [focusRegion]);

  const openNotificationOnScheme = useCallback((n: AppNotification) => {
    setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)));
    setNotificationToasts((prev) => prev.filter((item) => item.id !== n.id));
    setShowNotifications(false);
    setShowFlagConflictsDialog(false);
    setShowFlagsManager(false);
    setFlagsManagerFocusId(null);

    if (n.kind === 'update') {
      if (n.url) window.open(n.url, '_blank', 'noopener,noreferrer');
      return;
    }

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

    if ((n.kind === 'orphan' || n.kind === 'height') && n.aId) {
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
      if (scheme && n.flagName) {
        requestFitOnIds(conflictHighlightFitIds(scheme, n.flagName, n.aId, n.bId));
      } else {
        requestFitOnIds([n.aId, n.bId]);
      }
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
      if (scheme) {
        requestFitOnIds(conflictHighlightFitIds(scheme, n.flagName, n.aId, n.bId));
      } else {
        requestFitOnIds([n.aId, n.bId]);
      }
    }
  }, [flagConflicts, scheme, requestFitOnIds, focusRegion]);

  const formatValidation = useCallback(() => ({
    invalidId: (id: string) => t('validate.invalidId', { id }),
    hardError: (msg: string) => t('validate.hardError', { msg }),
    ambiguous: (flag: string, a: string, b: string) => t('validate.ambiguous', { flag, a, b }),
    incompleteManual: (id: string) => t('validate.incompleteManual', { id }),
  }), [t]);

  const handleOpenFileClick = () => {
    if (scheme) {
      setShowOpenFileConfirm(true);
      return;
    }
    void performOpenFile();
  };

  const showOpenFileError = useCallback((message: string) => {
    setStatus(t('status.error', { msg: message }));
    setValidationDialog({
      title: t('status.openFileErrorTitle'),
      intro: t('status.openFileErrorIntro'),
      issues: [{ severity: 'error', code: 'hardError', text: message }],
    });
  }, [t]);

  const performOpenFile = async () => {
    try {
      const picked = await openSchemeOrYamlWithDialog();
      if (!picked) return;

      if (isYamlFileName(picked.name)) {
        try {
          await runBusy(t('status.building'), async () => {
            await parseYaml(picked.file);
            clearCameraRequests();
            const result = await buildScheme();
            applyScheme(result.scheme, true, collapseThreshold);
            setStatus(t('status.schemeReady'));
          });
        } catch (err) {
          showOpenFileError(
            t('status.yamlInvalid', { msg: String(err) }),
          );
        }
        return;
      }

      if (!isSchemeFileName(picked.name)) {
        showOpenFileError(t('status.unsupportedFile', { name: picked.name }));
        return;
      }

      let parsed: Scheme;
      try {
        parsed = JSON.parse(picked.text) as Scheme;
      } catch {
        showOpenFileError(t('status.schemeInvalidJson'));
        return;
      }

      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.regions)) {
        showOpenFileError(t('status.schemeInvalidContent'));
        return;
      }

      try {
        await runBusy(t('status.building'), async () => {
          clearCameraRequests();
          const loaded = await importScheme(parsed);
          applyScheme(loaded, true, collapseThreshold);
          setStatus(t('status.schemeLoaded'));
        });
      } catch (err) {
        showOpenFileError(t('status.schemeInvalidContentDetail', { msg: String(err) }));
      }
    } catch (err) {
      if (isUserCancelled(err)) return;
      showOpenFileError(String(err));
    }
  };

  const handleConfirmOpenFile = async () => {
    setShowOpenFileConfirm(false);
    await performOpenFile();
  };

  const handleConfirmResetScheme = async () => {
    setShowResetConfirm(false);
    try {
      await runBusy(t('status.resetting'), async () => {
        setStatus(t('status.clearingManuals'));
        await clearManualRegions();
        clearCameraRequests();
        const result = await buildScheme();
        applyScheme(result.scheme, true, collapseThreshold);
        setStatus(t('status.schemeReady'));
      });
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

  const toggleChildren = useCallback((regionId: string, hide: boolean) => {
    if (!scheme) return;
    const node = findForestNode(scheme, regionId);
    if (!node) return;
    const childIds = node.children.map((c: ForestNode) => c.id);
    const next = new Set(hiddenNodes);
    for (const cid of childIds) {
      if (hide) next.add(cid);
      else next.delete(cid);
    }
    setHiddenNodes(next);
    const branch = [regionId, ...collectDescendants(node)].filter((id) => !next.has(id));
    requestFitOnIds(branch.length > 0 ? branch : [regionId]);
  }, [scheme, hiddenNodes, requestFitOnIds]);

  const toggleRecursive = useCallback((regionId: string, hide: boolean) => {
    if (!scheme) return;
    const node = findForestNode(scheme, regionId);
    if (!node) return;
    const ids = collectDescendants(node);
    const next = new Set(hiddenNodes);
    for (const id of ids) {
      if (hide) next.add(id);
      else next.delete(id);
    }
    setHiddenNodes(next);
    const branch = [regionId, ...collectDescendants(node)].filter((id) => !next.has(id));
    requestFitOnIds(branch.length > 0 ? branch : [regionId]);
  }, [scheme, hiddenNodes, requestFitOnIds]);

  const handleCollapseAll = useCallback(() => {
    if (!scheme) return;
    const next = computeCollapseAllHidden(scheme);
    setHiddenNodes(next);
    const visible = scheme.regions.map((r) => r.id).filter((id) => !next.has(id));
    requestFitOnIds(visible);
  }, [scheme, requestFitOnIds]);

  const handleExpandAll = useCallback(() => {
    if (!scheme) return;
    setHiddenNodes(computeExpandAllHidden());
    clearCameraRequests();
  }, [scheme, clearCameraRequests]);

  const handleExpandThreshold = useCallback(() => {
    if (!scheme) return;
    setHiddenNodes(computeDefaultHiddenNodes(scheme, collapseThreshold));
    clearCameraRequests();
  }, [scheme, collapseThreshold, clearCameraRequests]);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((v) => !v);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => graphRef.current?.resize());
    });
  }, []);

  const openAddDialog = useCallback((initialParent?: string) => {
    setAddDialogInitialParent(initialParent);
    setShowAddDialog(true);
  }, []);

  const closeAddDialog = useCallback(() => {
    setShowAddDialog(false);
    setAddDialogInitialParent(undefined);
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
      await runBusy(t('status.building'), async () => {
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
        // Keep collapse/highlight state; only append the new region visually.
        applyScheme(result.scheme, false, collapseThreshold);
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
      });
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
    setDetailsNav({ stack: [id], index: 0 });
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => {
      const target = prev.find((n) => n.id === id);
      if (target) rememberDismissedUpdate(target);
      return prev.filter((n) => n.id !== id);
    });
    setNotificationToasts((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const dismissAllToasts = useCallback(() => {
    setNotificationToasts([]);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      // F11 (browser UI fullscreen) is not the Fullscreen API — JS cannot exit it.
      const browserFs =
        window.innerHeight >= screen.height - 2
        && window.innerWidth >= screen.width - 2;
      if (browserFs) {
        setStatus(t('graph.fullscreenF11Hint'));
        return;
      }
      await document.documentElement.requestFullscreen();
    } catch (err) {
      setStatus(t('status.error', { msg: String(err) }));
    }
  }, [t]);

  useEffect(() => {
    const sync = () => {
      const apiFs = Boolean(document.fullscreenElement);
      const browserFs =
        !apiFs
        && window.innerHeight >= screen.height - 2
        && window.innerWidth >= screen.width - 2;
      setIsFullscreen(apiFs || browserFs);
    };
    document.addEventListener('fullscreenchange', sync);
    window.addEventListener('resize', sync);
    sync();
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      window.removeEventListener('resize', sync);
    };
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
    if (!region) return;
    const node = findForestNode(scheme, regionId);
    const childIds = node?.children.map((child) => child.id) ?? [];
    setDeleteTarget({ regionId, childIds, parentId: region.parent ?? null });
  }, [scheme]);

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
        setDetailsNav(null);
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

  const handleRename = useCallback(async (regionId: string, newId: string) => {
    const normalized = newId.trim().toLowerCase();
    await renameRegion(regionId, normalized);
    const result = await buildScheme();
    applyScheme(result.scheme, false, collapseThreshold);
    setDetailsNav((prev) => {
      if (!prev) return { stack: [normalized], index: 0 };
      const stack = prev.stack.map((id) => (id === regionId ? normalized : id));
      return { ...prev, stack };
    });
    setSelectedId((id) => (id === regionId ? normalized : id));
    setCollapseTarget((id) => (id === regionId ? normalized : id));
    setDeletableRegionIds((prev) => {
      if (!prev.has(regionId)) return prev;
      const next = new Set(prev);
      next.delete(regionId);
      next.add(normalized);
      return next;
    });
    setHiddenNodes((prev) => {
      if (!prev.has(regionId)) return prev;
      const next = new Set(prev);
      next.delete(regionId);
      // don't hide the new id
      return next;
    });
    setStatus(t('status.regionRenamed', { oldId: regionId, id: normalized }));
  }, [t, applyScheme, collapseThreshold]);

  const handleUpdatePriority = useCallback(async (regionId: string, priority: number) => {
    await updateRegionPriority(regionId, priority);
    setScheme((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        regions: prev.regions.map((r) =>
          r.id === regionId ? { ...r, priority } : r,
        ),
      };
    });
    setStatus(t('status.priorityUpdated', { id: regionId }));
  }, [t]);

  const handleUpdateMembers = useCallback(async (
    regionId: string,
    owners: Record<string, unknown>,
    members: Record<string, unknown>,
  ) => {
    await updateRegionMembers(regionId, owners, members);
    setScheme((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        regions: prev.regions.map((r) =>
          r.id === regionId ? { ...r, owners, members } : r,
        ),
      };
    });
    setStatus(t('status.membersUpdated', { id: regionId }));
  }, [t]);

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

  const handleRefreshNotifications = useCallback(() => {
    if (!scheme) return;
    quietNotificationReseedRef.current = true;
    conflictNotifySeededForRef.current = null;
    setNotificationRefreshSeq((n) => n + 1);
  }, [scheme]);

  const doExportRegionsYaml = useCallback(async (includeManual: boolean) => {
    if (!scheme || !flagConflicts) return;

    const result = validateSchemeForYamlExport(
      scheme,
      flagConflicts,
      { includeManual },
      formatValidation(),
    );
    if (!result.ok) {
      setValidationDialog({
        title: t('status.exportIssuesTitle'),
        intro: t('status.exportIssuesIntro'),
        issues: result.issues,
      });
      return;
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
  }, [scheme, flagConflicts, formatValidation, t]);

  const handleExportRegionsYaml = useCallback(() => {
    if (!scheme || !flagConflicts) return;
    // Base checks that always apply (names, cycles, ambiguous conflicts).
    const base = validateSchemeForYamlExport(
      scheme,
      flagConflicts,
      { includeManual: false },
      formatValidation(),
    );
    if (!base.ok) {
      setValidationDialog({
        title: t('status.exportIssuesTitle'),
        intro: t('status.exportIssuesIntro'),
        issues: base.issues,
      });
      return;
    }
    setShowExportManualConfirm(true);
  }, [scheme, flagConflicts, formatValidation, t]);

  const downloadText = (text: string, filename: string, type = 'application/json') => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const hasScheme = Boolean(scheme);
  const emptySchemeChrome = !hasScheme;
  const schemeActionsDisabled = !hasScheme || Boolean(busyMessage);

  const applyHighlightFlag = useCallback((name: string | null) => {
    setSubtreeHighlightRoot(null);
    setSubtreeHighlightIds(null);
    setSubtreeHighlightMode(null);
    setProblemFilter(null);
    setHighlightFlag(name);
    if (!name) {
      setConflictSchemeView(null);
      setOverwriteSchemeView(null);
      setFlagHighlightShowIntersects(false);
      setFlagHighlightShowContains(false);
      setFlagHighlightShowInheritance(false);
      setFlagHighlightShowConflicts(false);
      setShowFlagHighlightOptsMenu(false);
      return;
    }
    // Defaults when enabling flag scheme: all highlight layers on.
    setFlagHighlightShowIntersects(true);
    setFlagHighlightShowContains(true);
    setFlagHighlightShowInheritance(true);
    setFlagHighlightShowConflicts(true);
    if (!scheme) return;
    const hl = buildFlagHighlight(scheme, name, {
      showInheritance: true,
      showContains: true,
      showIntersects: true,
      showConflicts: true,
    });
    let fitHl = hl;
    if (flagConflicts) {
      fitHl = attachFlagConflicts(hl, flagConflicts.spatialConflicts, name);
      const pairs = flagConflicts.spatialConflicts
        .filter((c) => c.flagName === name)
        .map((c) => ({ aId: c.aId, bId: c.bId }));
      fitHl = mergeConflictInheritancePaths(fitHl, scheme, pairs);
    }
    const ids = Array.from(new Set([
      ...fitHl.brightIds,
      ...(fitHl.conflictIds ?? []),
      ...(fitHl.containedNoInheritIds ?? []),
      ...(fitHl.intersectPartialIds ?? []),
    ]));
    if (ids.length > 0) {
      const parentMap = buildParentMap(scheme.regions);
      setHiddenNodes((prev) => {
        let next = prev;
        for (const id of ids) next = revealPathToNode(id, next, parentMap);
        return next;
      });
      requestFitOnIds(ids);
    }
  }, [scheme, requestFitOnIds, flagConflicts]);

  const handleClearAllFlags = useCallback(async () => {
    const result = await clearAllRegionFlags();
    setScheme((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        regions: prev.regions.map((r) => (
          Object.keys(r.flags).length === 0 ? r : { ...r, flags: {} }
        )),
      };
    });
    if (highlightFlag) {
      applyHighlightFlag(null);
    }
    setStatus(t('status.flagsClearedAll', { count: result.count }));
    return { count: result.count };
  }, [t, highlightFlag, applyHighlightFlag]);

  const handleRelayout = useCallback(() => {
    if (!scheme) return;
    layoutSeqRef.current += 1;
    setLayoutRequest({ seq: layoutSeqRef.current });
    setStatus(t('status.relayout'));
  }, [scheme, t]);

  const blockBrowserMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <div className="app">
      {!sidebarCollapsed && (
      <aside
        className="toolbar"
        style={{ width: sidebarWidth, flexBasis: sidebarWidth }}
      >
        <div
          className="sidebar-resize-handle"
          title={t('app.resizeSidebar')}
          onMouseDown={(e) => {
            e.preventDefault();
            sidebarResizeRef.current = { startX: e.clientX, startWidth: sidebarWidth };
            document.body.classList.add('sidebar-resizing');
          }}
        />
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
        <button
          type="button"
          className={emptySchemeChrome ? 'primary' : undefined}
          onClick={handleOpenFileClick}
          disabled={Boolean(busyMessage)}
        >
          <span aria-hidden>📂 </span>{t('app.openFile')}
        </button>
        <button type="button" className="success" onClick={handleSaveScheme} disabled={!hasScheme || Boolean(busyMessage)}>
          <span aria-hidden>💾 </span>{t('app.saveScheme')}
        </button>
        <button
          type="button"
          onClick={() => handleExportRegionsYaml()}
          disabled={schemeActionsDisabled || flagsCatalog.length === 0}
        >
          <span aria-hidden>⇩ </span>{t('app.exportRegionsYml')}
        </button>
        </section>
        <section className="toolbar-section">
        <button type="button" onClick={() => openFlagsManager()} disabled={schemeActionsDisabled}>
          <span aria-hidden>⚑ </span>{t('app.flagsManager')}
        </button>
        <button type="button" onClick={() => setShowFlagsCatalog(true)} disabled={schemeActionsDisabled}>
          <span aria-hidden>☷ </span>{t('app.flagsCatalog')}
        </button>
        <button
          type="button"
          onClick={() => setShowFlagConflictsDialog(true)}
          disabled={schemeActionsDisabled || flagsCatalog.length === 0}
        >
          <span aria-hidden>⚠ </span>{t('app.analyzeFlagConflicts')}
        </button>
        </section>
        <section className="toolbar-section">
        <button type="button" onClick={() => setShowMetrics(true)} disabled={schemeActionsDisabled}>
          <span aria-hidden>📊 </span>{t('app.metrics')}
        </button>
        </section>

        <div className="settings-block">
          <p className="depth-scale-title">{t('app.autoCollapse')}</p>
          <p className="depth-scale-hint">{t('app.autoCollapseHint')}</p>
          <label className="threshold-control">
            <span className="threshold-control-label">
              {t('app.threshold')}:
              <input
                type="number"
                className="threshold-number"
                min={0}
                max={200}
                step={1}
                value={collapseThreshold}
                disabled={schemeActionsDisabled}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw.trim() === '') return;
                  const n = Number(raw);
                  if (!Number.isFinite(n)) return;
                  setCollapseThreshold(Math.max(0, Math.min(200, Math.round(n))));
                }}
              />
            </span>
            <input
              type="range"
              min={0}
              max={200}
              step={1}
              value={collapseThreshold}
              disabled={schemeActionsDisabled}
              onChange={(e) => setCollapseThreshold(Number(e.target.value))}
            />
          </label>
        </div>

        <p className="status">{status}</p>
        <div className="sidebar-footer">
          <button
            type="button"
            className="warning"
            onClick={() => setShowResetConfirm(true)}
            disabled={schemeActionsDisabled}
          >
            <span aria-hidden>⟳ </span>{t('app.updateScheme')}
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => setShowClearConfirm(true)}
            disabled={schemeActionsDisabled}
          >
            {t('app.clearScheme')}
          </button>
        </div>
      </aside>
      )}

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
                <button type="button" className="primary" onClick={() => setShowClearConfirm(false)}>
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

      {showResetConfirm && (
        <div className="modal-overlay" onClick={() => setShowResetConfirm(false)}>
          <div className="modal clear-scheme-modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>{t('app.updateScheme')}</h2>
              <button type="button" onClick={() => setShowResetConfirm(false)}>×</button>
            </header>
            <div className="modal-body">
              <p>{t('app.resetSchemeConfirm')}</p>
              <div className="modal-actions">
                <button type="button" className="primary" onClick={() => setShowResetConfirm(false)}>
                  {t('app.no')}
                </button>
                <button type="button" className="danger" onClick={() => { void handleConfirmResetScheme(); }}>
                  {t('app.yes')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showOpenFileConfirm && (
        <ConfirmDialog
          title={t('app.openFileConfirmTitle')}
          message={t('app.loadSchemeConfirm')}
          onCancel={() => setShowOpenFileConfirm(false)}
          onConfirm={() => { void handleConfirmOpenFile(); }}
        />
      )}

      {showExportManualConfirm && (
        <ConfirmDialog
          title={t('status.exportAskManualTitle')}
          message={t('status.exportAskManual')}
          confirmClass="success"
          onDismiss={() => setShowExportManualConfirm(false)}
          onCancel={() => {
            setShowExportManualConfirm(false);
            void doExportRegionsYaml(false);
          }}
          onConfirm={() => {
            setShowExportManualConfirm(false);
            void doExportRegionsYaml(true);
          }}
        />
      )}

      {validationDialog && (
        <ValidationResultDialog
          title={validationDialog.title}
          intro={validationDialog.intro}
          issues={validationDialog.issues}
          okMessage={validationDialog.okMessage}
          onClose={() => setValidationDialog(null)}
        />
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
              layoutRequest={layoutRequest}
              locked={graphLocked}
              conflictRegionIds={conflictRegionIds}
              flagHighlight={flagHighlight}
              attentionBrightIds={attentionBrightIds}
              attentionBrightEdgeKeys={attentionBrightEdgeKeys}
              subtreeHighlightActive={Boolean(subtreeHighlightRoot)}
              edgeDisplayFilters={edgeDisplayFilters}
              onNodeSelect={onNodeSelect}
              onNodeOpen={onNodeOpen}
              onBackgroundTap={clearSelection}
              onCopyName={onCopyName}
              onRename={(id) => setRenameTargetId(id)}
              onAddManual={() => openAddDialog()}
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
              <button
                type="button"
                className="graph-ctrl-btn"
                onClick={toggleSidebarCollapsed}
                title={sidebarCollapsed ? t('app.expandSidebar') : t('app.collapseSidebar')}
              >
                {sidebarCollapsed ? '»' : '«'}
              </button>
              <button type="button" className="graph-ctrl-btn" onClick={() => openAddDialog()} title={t('app.addManual')} disabled={Boolean(busyMessage)}>
                <IconAdd />
              </button>
            </div>
            <div className="graph-map-controls graph-map-controls--top-right">
              <button
                type="button"
                className="graph-ctrl-btn"
                onClick={handleCollapseAll}
                title={t('app.collapseAll')}
                disabled={Boolean(busyMessage)}
              >
                <IconCollapseAll />
              </button>
              <button
                type="button"
                className="graph-ctrl-btn"
                onClick={handleExpandAll}
                title={t('app.expandAll')}
                disabled={Boolean(busyMessage)}
              >
                <IconExpandAll />
              </button>
              <button
                type="button"
                className="graph-ctrl-btn"
                onClick={handleExpandThreshold}
                title={t('app.expandThreshold')}
                disabled={Boolean(busyMessage)}
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
                onRefresh={handleRefreshNotifications}
                onMarkAllRead={() => {
                  setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
                }}
                onClear={() => {
                  setNotifications((prev) => {
                    for (const n of prev) {
                      if (n.level === 'warning') rememberDismissedUpdate(n);
                    }
                    return prev.filter((n) => n.level !== 'warning');
                  });
                  setNotificationToasts((prev) => prev.filter((n) => n.level !== 'warning'));
                }}
                onDismiss={dismissNotification}
                onOpenItem={openNotificationOnScheme}
              />
            </div>
            <div className="graph-map-controls graph-map-controls--bottom-left">
              {(highlightFlag || subtreeHighlightRoot || problemFilter) && (
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
                onClick={handleRelayout}
                title={t('app.relayout')}
                disabled={Boolean(busyMessage)}
              >
                <IconAlign />
              </button>
              <button
                type="button"
                className={`graph-ctrl-btn${highlightFlag ? ' graph-ctrl-btn--active' : ''}`}
                onClick={() => setShowFlagTreeDialog(true)}
                title={t('flagsManager.flagHighlightTitle')}
                disabled={Boolean(busyMessage)}
              >
                <IconFlag />
              </button>
              {highlightFlag && (
                <div className="graph-problems-root" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className={`graph-ctrl-btn${
                      flagHighlightShowIntersects
                      || flagHighlightShowContains
                      || flagHighlightShowInheritance
                      || flagHighlightShowConflicts
                        ? ' graph-ctrl-btn--active'
                        : ''
                    }`}
                    onClick={() => toggleBottomLeftMenu('flagOpts')}
                    title={t('app.flagHighlightOptions')}
                    aria-pressed={
                      flagHighlightShowIntersects
                      || flagHighlightShowContains
                      || flagHighlightShowInheritance
                      || flagHighlightShowConflicts
                    }
                    aria-expanded={showFlagHighlightOptsMenu}
                  >
                    <IconFlagHighlightOpts />
                  </button>
                  {showFlagHighlightOptsMenu && (
                    <div className="graph-problems-menu" role="menu">
                      <label className="graph-menu-check">
                        <input
                          type="checkbox"
                          checked={flagHighlightShowIntersects}
                          onChange={(e) => setFlagHighlightShowIntersects(e.target.checked)}
                        />
                        <span>{t('app.flagHighlightShowIntersects')}</span>
                      </label>
                      <label className="graph-menu-check">
                        <input
                          type="checkbox"
                          checked={flagHighlightShowContains}
                          onChange={(e) => setFlagHighlightShowContains(e.target.checked)}
                        />
                        <span>{t('app.flagHighlightShowContains')}</span>
                      </label>
                      <label className="graph-menu-check">
                        <input
                          type="checkbox"
                          checked={flagHighlightShowInheritance}
                          onChange={(e) => setFlagHighlightShowInheritance(e.target.checked)}
                        />
                        <span>{t('app.flagHighlightShowInheritance')}</span>
                      </label>
                      <label className="graph-menu-check">
                        <input
                          type="checkbox"
                          checked={flagHighlightShowConflicts}
                          onChange={(e) => setFlagHighlightShowConflicts(e.target.checked)}
                        />
                        <span>{t('app.flagHighlightShowConflicts')}</span>
                      </label>
                    </div>
                  )}
                </div>
              )}
              <div className="graph-problems-root" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className={`graph-ctrl-btn${
                    !(
                      edgeDisplayFilters.intersects
                      && edgeDisplayFilters.contains
                      && edgeDisplayFilters.hierarchy
                    )
                      ? ' graph-ctrl-btn--active'
                      : ''
                  }`}
                  onClick={() => toggleBottomLeftMenu('edge')}
                  title={t('app.edgeDisplayMode')}
                  aria-pressed={!(
                    edgeDisplayFilters.intersects
                    && edgeDisplayFilters.contains
                    && edgeDisplayFilters.hierarchy
                  )}
                  aria-expanded={showEdgeModeMenu}
                >
                  <IconEdgeFilter />
                </button>
                {showEdgeModeMenu && (
                  <div className="graph-problems-menu" role="menu">
                    {(
                      [
                        ['intersects', 'app.edgeFilterIntersects'],
                        ['contains', 'app.edgeFilterContains'],
                        ['hierarchy', 'app.edgeFilterHierarchy'],
                      ] as const
                    ).map(([key, labelKey]) => (
                      <label key={key} className="graph-menu-check">
                        <input
                          type="checkbox"
                          checked={edgeDisplayFilters[key]}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setEdgeDisplayFilters((prev) => ({ ...prev, [key]: on }));
                          }}
                        />
                        <span>{t(labelKey)}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="graph-problems-root" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className={`graph-ctrl-btn${problemFilter ? ' graph-ctrl-btn--warn-active' : ''}`}
                  onClick={() => toggleBottomLeftMenu('problems')}
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
                      onClick={() => setProblemsMode('error')}
                    >
                      {t('app.problemsErrors')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className={problemFilter === 'warning' ? 'active' : ''}
                      onClick={() => setProblemsMode('warning')}
                    >
                      {t('app.problemsWarnings')}
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="graph-map-controls graph-map-controls--bottom-right">
              <button
                type="button"
                className="graph-ctrl-btn"
                onClick={() => setShowLegend(true)}
                title={t('app.legend')}
              >
                <IconLegend />
              </button>
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
          <>
            <div className="graph-map-controls graph-map-controls--top-left">
              <button
                type="button"
                className="graph-ctrl-btn"
                onClick={toggleSidebarCollapsed}
                title={sidebarCollapsed ? t('app.expandSidebar') : t('app.collapseSidebar')}
              >
                {sidebarCollapsed ? '»' : '«'}
              </button>
            </div>
            <div className="placeholder">{t('app.placeholder')}</div>
          </>
        )}
      </main>

      {detailsRegion && (
        <RegionPanel
          region={detailsRegion}
          childIds={detailsChildIds}
          spatialRelations={detailsSpatialRelations}
          spatialEdges={scheme?.spatialEdges ?? []}
          regionsById={regionsById}
          flagsCatalog={flagsCatalog}
          regionIds={regionIdList}
          hierarchyDepth={hierarchyDepthMap.get(detailsRegion.id) ?? 0}
          canGoBack={detailsCanGoBack}
          canGoForward={detailsCanGoForward}
          onHistoryBack={() => goDetailsHistory(-1)}
          onHistoryForward={() => goDetailsHistory(1)}
          onClose={closeRegionDetails}
          onFocusRegion={openRegionDetails}
          onDeleteManual={requestDeleteManual}
          canDelete
          onUpdateParent={handleUpdateParent}
          onUpdateFlags={handleUpdateFlags}
          onUpdateGeometry={handleUpdateGeometry}
          onRequestRename={(id) => setRenameTargetId(id)}
          onUpdatePriority={handleUpdatePriority}
          onUpdateMembers={handleUpdateMembers}
          onShowFlagOnScheme={(flagName) => {
            closeRegionDetails();
            applyHighlightFlag(flagName);
          }}
        />
      )}
      {deleteTarget && (
        <DeleteManualRegionDialog
          regionId={deleteTarget.regionId}
          childIds={deleteTarget.childIds}
          parentId={deleteTarget.parentId}
          onConfirm={handleConfirmDeleteManual}
          onClose={() => setDeleteTarget(null)}
        />
      )}
      {showMetrics && scheme && (
        <MetricsPanel
          metrics={scheme.metrics}
          onClose={() => setShowMetrics(false)}
          onSelectRegion={(id) => {
            setShowMetrics(false);
            openRegionDetails(id);
          }}
        />
      )}
      {showLegend && (
        <LegendPanel onClose={() => setShowLegend(false)} />
      )}
      {showSearch && scheme && (
        <SearchPanel
          regionIds={regionIdList}
          parentMap={buildParentMap(scheme.regions)}
          onClose={() => setShowSearch(false)}
          onSelect={focusRegion}
        />
      )}
      {showFlagTreeDialog && scheme && (
        <FlagTreeDialog
          scheme={scheme}
          flagsCatalog={flagsCatalog}
          highlightFlag={highlightFlag}
          onClose={() => setShowFlagTreeDialog(false)}
          onHighlightFlag={(name) => {
            applyHighlightFlag(name);
            setShowFlagTreeDialog(false);
          }}
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
          onClearAllFlags={handleClearAllFlags}
          onOpenCatalog={() => setShowFlagsCatalog(true)}
          initialRegionId={flagsManagerFocusId}
          onShowFlagOnScheme={(flagName) => {
            closeFlagsManager();
            applyHighlightFlag(flagName);
          }}
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
      {showAddDialog && (
        <AddRegionDialog
          key={addDialogInitialParent ?? 'free'}
          regionIds={parentOptions}
          flagsCatalog={flagsCatalog}
          initialParent={addDialogInitialParent}
          onAdd={handleAddManual}
          onClose={closeAddDialog}
          onShowFlagOnScheme={(flagName) => {
            closeAddDialog();
            applyHighlightFlag(flagName);
          }}
        />
      )}
      {renameTargetId && (
        <RenameRegionDialog
          regionId={renameTargetId}
          onRename={handleRename}
          onClose={() => setRenameTargetId(null)}
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
            requestFitOnIds(
              conflictHighlightFitIds(scheme, conflict.flagName, conflict.aId, conflict.bId),
            );
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
            requestFitOnIds(
              conflictHighlightFitIds(
                scheme,
                overwrite.flagName,
                overwrite.parentId,
                overwrite.childId,
              ),
            );
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
              className={`notification-toast notification-toast--${toast.level}${toast.kind === 'info' || toast.kind === 'update' ? ' notification-toast--info' : ''}`}
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
                {toast.kind === 'info' || toast.kind === 'update'
                  ? t('notifications.tabInfo')
                  : toast.level === 'error'
                    ? t('notifications.tabErrors')
                    : t('notifications.tabWarnings')}
              </span>
              <strong>{t(toast.titleKey, toast.params)}</strong>
              <span>{t(toast.bodyKey, toast.params)}</span>
              {toast.kind === 'update' ? (
                <span className="notification-toast-hint">{t('notifications.updateHint')}</span>
              ) : toast.kind !== 'info' ? (
                <span className="notification-toast-hint">{t('notifications.toastHint')}</span>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {busyMessage && (
        <div className="busy-overlay" role="alert" aria-busy="true">
          <div className="busy-spinner" />
          <p className="busy-overlay-message">{busyMessage}</p>
        </div>
      )}
      {serverDown && (
        <div className="server-down-overlay" role="alert" aria-live="assertive">
          <p className="server-down-title">{t('server.downTitle')}</p>
          <p className="server-down-body">{t('server.downBody')}</p>
        </div>
      )}
    </div>
  );
}
