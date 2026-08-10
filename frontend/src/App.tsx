import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchFlags } from './api';
import { AppDialogs } from './components/AppDialogs';
import { AppSidebar } from './components/AppSidebar';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  EmptySchemeChrome,
  GraphChromeControls,
} from './components/GraphChromeControls';
import {
  GraphView,
  DEFAULT_EDGE_DISPLAY_FILTERS,
  type EdgeDisplayFilters,
  type GraphViewHandle,
} from './components/GraphView';
import { RegionPanel } from './components/RegionPanel';
import type { FlagInfo, Scheme } from './types';
import {
  buildHierarchyDepthMap,
  buildParentMap,
  findForestNode,
  getSpatialRelationsGrouped,
} from './utils/graph';
import { computeEffectiveFlagsByRegion, runWorldGuardFlagChecks } from './utils/flagConflicts';
import { compareNatural } from './utils/naturalSort';
import { findNonStandardHeightRegionIds } from './utils/worldHeight';
import { useI18n } from './i18n/I18nContext';
import { useServerHealth } from './hooks/useServerHealth';
import { useSidebarLayout } from './hooks/useSidebarLayout';
import { useGraphCamera } from './hooks/useGraphCamera';
import { useCollapseState } from './hooks/useCollapseState';
import { useSchemeSession, type ExportGate } from './hooks/useSchemeSession';
import { useConflictNotifications } from './hooks/useConflictNotifications';
import { useGraphHighlights } from './hooks/useGraphHighlights';
import { useRegionMutations } from './hooks/useRegionMutations';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useWhatsNewDialog } from './hooks/useWhatsNewDialog';

const BASE_NODE_SIZE = 60;

export default function App() {
  const { t } = useI18n();
  const graphRef = useRef<GraphViewHandle>(null);
  const schemeKeyRef = useRef('default');
  const isFreshSchemeRef = useRef(false);
  const baseSize = BASE_NODE_SIZE;

  const clearCameraBundleRef = useRef(() => {});
  const onFreshSchemeRef = useRef((_next: Scheme, _threshold: number) => {});
  const onClearAppExtrasRef = useRef(() => {});
  const getCollapseThresholdRef = useRef<() => number>(() => 0);
  const exportGateRef = useRef<ExportGate>({
    refreshExportErrors: () => {},
    showExportBlockedFlash: () => {},
  });

  const camera = useGraphCamera();
  const session = useSchemeSession({
    getCollapseThreshold: () => getCollapseThresholdRef.current(),
    onFreshScheme: (next, threshold) => onFreshSchemeRef.current(next, threshold),
    clearCameraRequests: () => clearCameraBundleRef.current(),
    onClearAppExtras: () => onClearAppExtrasRef.current(),
    schemeKeyRef,
    isFreshSchemeRef,
    exportGateRef,
  });
  camera.setSchemeRef(session.scheme);

  const collapse = useCollapseState(
    session.scheme,
    camera.requestFitOnIds,
    () => clearCameraBundleRef.current(),
    schemeKeyRef,
    isFreshSchemeRef,
  );
  getCollapseThresholdRef.current = () => collapse.collapseThreshold;

  const {
    sidebarCollapsed,
    setSidebarCollapsed,
    sidebarWidth,
    beginResize,
  } = useSidebarLayout(graphRef);
  const serverDown = useServerHealth();

  const [flagsCatalog, setFlagsCatalog] = useState<FlagInfo[]>([]);
  const [detailsNav, setDetailsNav] = useState<{ stack: string[]; index: number } | null>(null);
  const detailsId = detailsNav?.stack[detailsNav.index] ?? null;
  const detailsCanGoBack = Boolean(detailsNav && detailsNav.index > 0);
  const detailsCanGoForward = Boolean(
    detailsNav && detailsNav.index < detailsNav.stack.length - 1,
  );
  const [showMetrics, setShowMetrics] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [showFlagsCatalog, setShowFlagsCatalog] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showFlagsManager, setShowFlagsManager] = useState(false);
  const [flagsManagerFocusId, setFlagsManagerFocusId] = useState<string | null>(null);
  const [flagsManagerFilterFlag, setFlagsManagerFilterFlag] = useState<string | null>(null);
  const [showFlagConflictsDialog, setShowFlagConflictsDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addDialogInitialParent, setAddDialogInitialParent] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<{
    regionId: string;
    childIds: string[];
    parentId: string | null;
  } | null>(null);
  const [showFlagTreeDialog, setShowFlagTreeDialog] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [edgeDisplayFilters, setEdgeDisplayFilters] = useState<EdgeDisplayFilters>(
    DEFAULT_EDGE_DISPLAY_FILTERS,
  );

  const closeFlagsManager = useCallback(() => {
    setShowFlagsManager(false);
    setFlagsManagerFocusId(null);
    setFlagsManagerFilterFlag(null);
  }, []);

  const openFlagsManager = useCallback((regionId?: string, filterFlag?: string) => {
    setFlagsManagerFocusId(regionId ?? null);
    setFlagsManagerFilterFlag(filterFlag?.trim() || null);
    setShowFlagsManager(true);
  }, []);

  const closeAddDialog = useCallback(() => {
    setShowAddDialog(false);
    setAddDialogInitialParent(undefined);
  }, []);

  const openAddDialog = useCallback((initialParent?: string) => {
    setAddDialogInitialParent(initialParent);
    setShowAddDialog(true);
  }, []);

  const regionsById = useMemo(() => {
    const map = new Map<string, import('./types').RegionData>();
    if (!session.scheme) return map;
    for (const r of session.scheme.regions) map.set(r.id, r);
    return map;
  }, [session.scheme]);

  const hierarchyDepthMap = useMemo(
    () => (session.scheme ? buildHierarchyDepthMap(session.scheme) : new Map<string, number>()),
    [session.scheme],
  );

  const regionIdList = useMemo(
    () => (session.scheme ? session.scheme.regions.map((r) => r.id).sort(compareNatural) : []),
    [session.scheme],
  );

  const parentMap = useMemo(
    () => (session.scheme ? buildParentMap(session.scheme.regions) : new Map<string, string | null>()),
    [session.scheme],
  );

  const effectiveFlagsByRegion = useMemo(
    () => (session.scheme ? computeEffectiveFlagsByRegion(session.scheme) : null),
    [session.scheme],
  );

  const flagConflicts = useMemo(() => {
    if (!session.scheme) return null;
    if (flagsCatalog.length === 0) return null;
    return runWorldGuardFlagChecks({
      scheme: session.scheme,
      flagsCatalog,
      precomputedEffective: effectiveFlagsByRegion ?? undefined,
    });
  }, [session.scheme, flagsCatalog, effectiveFlagsByRegion]);
  session.setFlagConflicts(flagConflicts);

  const conflictRegionIds = useMemo(
    () => (flagConflicts ? flagConflicts.conflictRegionIds : new Set<string>()),
    [flagConflicts],
  );

  const nonStandardHeightIds = useMemo(() => {
    if (!session.scheme) return new Set<string>();
    return new Set(findNonStandardHeightRegionIds(session.scheme.regions));
  }, [session.scheme]);

  const detailsRegion = useMemo(() => {
    if (!session.scheme || !detailsId) return null;
    return session.scheme.regions.find((r) => r.id === detailsId) ?? null;
  }, [session.scheme, detailsId]);

  const detailsChildIds = useMemo(() => {
    if (!session.scheme || !detailsId) return [];
    const node = findForestNode(session.scheme, detailsId);
    if (!node) return [];
    return node.children.map((c) => c.id).sort(compareNatural);
  }, [session.scheme, detailsId]);

  const detailsSpatialRelations = useMemo(() => {
    if (!session.scheme || !detailsId) {
      return { intersects: [], containedIn: [], contains: [] };
    }
    return getSpatialRelationsGrouped(session.scheme, detailsId);
  }, [session.scheme, detailsId]);

  // Shared mutable setters so conflict-notification sync can prune scheme views
  // without waiting for a second render after useGraphHighlights mounts.
  const highlightViewSetters = useRef({
    setConflictSchemeView: ((_value: unknown) => {}) as React.Dispatch<React.SetStateAction<import('./utils/flagConflicts').SpatialConflict | null>>,
    setOverwriteSchemeView: ((_value: unknown) => {}) as React.Dispatch<React.SetStateAction<{
      flagName: string;
      parentId: string;
      childId: string;
    } | null>>,
  }).current;

  const notifications = useConflictNotifications(
    session.scheme,
    flagConflicts,
    session.orphanIds,
    nonStandardHeightIds,
    highlightViewSetters,
  );

  exportGateRef.current = {
    refreshExportErrors: notifications.handleRefreshExportErrors,
    showExportBlockedFlash: notifications.triggerExportBlockedFlash,
  };

  const whatsNew = useWhatsNewDialog();

  const focusRegion = useCallback((regionId: string) => {
    camera.focusRegion(regionId, collapse.setHiddenNodes);
    collapse.setCollapseTarget(regionId);
  }, [camera, collapse]);

  const highlights = useGraphHighlights(
    session.scheme,
    flagsCatalog,
    flagConflicts,
    session.orphanIds,
    nonStandardHeightIds,
    collapse.hiddenNodes,
    camera.requestFitOnIds,
    collapse.setHiddenNodes,
    camera.setSelectedId,
    collapse.setCollapseTarget,
    camera.setFitRequest,
    notifications.pushInfoToast,
    notifications.markNotificationRead,
    notifications.setShowNotifications,
    setShowFlagConflictsDialog,
    closeFlagsManager,
    focusRegion,
    session.setStatus,
  );

  highlightViewSetters.setConflictSchemeView = highlights.setConflictSchemeView;
  highlightViewSetters.setOverwriteSchemeView = highlights.setOverwriteSchemeView;

  const mutations = useRegionMutations({
    scheme: session.scheme,
    setScheme: session.setScheme,
    collapseThreshold: collapse.collapseThreshold,
    applyScheme: session.applyScheme,
    setStatus: session.setStatus,
    runBusy: session.runBusy,
    setHiddenNodes: collapse.setHiddenNodes,
    setSelectedId: camera.setSelectedId,
    setCollapseTarget: collapse.setCollapseTarget,
    focusAfterAdd: camera.focusAfterAdd,
    selectedId: camera.selectedId,
    detailsId,
    setDetailsNav,
    deleteTarget,
    setDeleteTarget,
    closeAddDialog,
    highlightFlag: highlights.highlightFlag,
    applyHighlightFlag: highlights.applyHighlightFlag,
  });

  clearCameraBundleRef.current = () => {
    camera.clearCameraRequests();
    collapse.setCollapseTarget(null);
    highlights.clearCameraSideHighlights();
  };

  onFreshSchemeRef.current = (next, threshold) => {
    notifications.prepareFreshSchemeNotifications();
    highlights.resetHighlightState();
    collapse.applyDefaultHidden(next, threshold);
  };

  onClearAppExtrasRef.current = () => {
    camera.resetCameraState();
    collapse.resetCollapseState();
    highlights.resetHighlightState();
    notifications.resetNotificationSchemeState();
    setDetailsNav(null);
    setShowMetrics(false);
    setShowLegend(false);
    setShowFlagsCatalog(false);
    setShowSearch(false);
    closeFlagsManager();
    setShowFlagConflictsDialog(false);
    setShowAddDialog(false);
    setAddDialogInitialParent(undefined);
    setDeleteTarget(null);
    setShowFlagTreeDialog(false);
    setRenameTargetId(null);
    setEdgeDisplayFilters(DEFAULT_EDGE_DISPLAY_FILTERS);
  };

  useEffect(() => {
    fetchFlags().then(setFlagsCatalog);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      const browserFs =
        window.innerHeight >= screen.height - 2
        && window.innerWidth >= screen.width - 2;
      if (browserFs) {
        session.setStatus(t('graph.fullscreenF11Hint'));
        return;
      }
      await document.documentElement.requestFullscreen();
    } catch (err) {
      session.setStatus(t('status.error', { msg: String(err) }));
    }
  }, [session, t]);

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

  useKeyboardShortcuts(
    {
      serverDown,
      detailsId,
      deleteTarget,
      showMetrics,
      showLegend,
      showFlagsCatalog,
      showFlagsManager,
      showFlagConflictsDialog,
      showAddDialog,
      showNotifications: notifications.showNotifications,
      showSearch,
      hasScheme: Boolean(session.scheme),
    },
    () => setShowSearch(true),
    toggleFullscreen,
  );

  const closeRegionDetails = useCallback(() => {
    setDetailsNav(null);
  }, []);

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

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((v) => !v);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => graphRef.current?.resize());
    });
  }, [setSidebarCollapsed]);

  const onNodeSelect = useCallback((id: string) => {
    camera.setSelectedId(id);
    collapse.setCollapseTarget(id);
  }, [camera, collapse]);

  const onNodeOpen = useCallback((id: string) => {
    camera.setSelectedId(id);
    collapse.setCollapseTarget(id);
    setDetailsNav({ stack: [id], index: 0 });
  }, [camera, collapse]);

  const onCopyName = useCallback((id: string) => {
    navigator.clipboard.writeText(id);
    session.setStatus(t('status.copied', { id }));
  }, [session, t]);

  const onContextCollapse = useCallback((id: string, hide: boolean) => {
    collapse.setCollapseTarget(id);
    camera.setSelectedId(id);
    collapse.toggleChildren(id, hide);
  }, [collapse, camera]);

  const onContextCollapseRecursive = useCallback((id: string, hide: boolean) => {
    collapse.setCollapseTarget(id);
    camera.setSelectedId(id);
    collapse.toggleRecursive(id, hide);
  }, [collapse, camera]);

  const onAddDescendant = useCallback((id: string) => {
    openAddDialog(id);
  }, [openAddDialog]);

  const clearSelection = useCallback(() => {
    camera.clearSelection();
    collapse.setCollapseTarget(null);
  }, [camera, collapse]);

  const handleRelayout = useCallback(() => {
    if (!session.scheme) return;
    camera.requestLayout();
    session.setStatus(t('status.relayout'));
  }, [session, camera, t]);

  const hasScheme = Boolean(session.scheme);
  const emptySchemeChrome = !hasScheme;
  const schemeActionsDisabled = !hasScheme || Boolean(session.busyMessage);

  const chromeActions = useMemo(() => ({
    toggleSidebarCollapsed,
    openAddDialog: () => openAddDialog(),
    handleCollapseAll: collapse.handleCollapseAll,
    handleExpandAll: collapse.handleExpandAll,
    handleExpandThreshold: collapse.handleExpandThreshold,
    openSearch: () => setShowSearch(true),
    toggleNotifications: () => notifications.setShowNotifications((v) => !v),
    closeNotifications: () => notifications.setShowNotifications(false),
    refreshNotifications: notifications.handleRefreshNotifications,
    markAllNotificationsRead: notifications.markAllRead,
    clearWarningNotifications: notifications.clearWarningNotifications,
    dismissNotification: notifications.dismissNotification,
    openNotification: highlights.openNotificationOnScheme,
    clearSpecialHighlight: highlights.clearSpecialHighlight,
    toggleGraphLocked: () => camera.setGraphLocked((v) => !v),
    relayout: handleRelayout,
    openFlagTree: () => setShowFlagTreeDialog(true),
    toggleBottomLeftMenu: highlights.toggleBottomLeftMenu,
    setFlagHighlightShowIntersects: highlights.setFlagHighlightShowIntersects,
    setFlagHighlightShowContains: highlights.setFlagHighlightShowContains,
    setFlagHighlightShowInheritance: highlights.setFlagHighlightShowInheritance,
    setFlagHighlightShowConflicts: highlights.setFlagHighlightShowConflicts,
    setEdgeDisplayFilters,
    setProblemsMode: highlights.setProblemsMode,
    openLegend: () => setShowLegend(true),
    toggleFullscreen,
    openFlagsManagerForFlag: (flag: string) => openFlagsManager(undefined, flag),
    applyHighlightFlag: (flag: string) => highlights.applyHighlightFlag(flag),
    focusRegion,
  }), [
    toggleSidebarCollapsed,
    openAddDialog,
    collapse,
    notifications,
    highlights,
    camera,
    handleRelayout,
    toggleFullscreen,
    openFlagsManager,
    focusRegion,
  ]);

  const dialogActions = useMemo(() => ({
    handleClearApp: () => { void session.handleClearApp(); },
    handleConfirmResetScheme: () => { void session.handleConfirmResetScheme(); },
    handleConfirmOpenFile: () => { void session.handleConfirmOpenFile(); },
    doExportRegionsYaml: (includeManual: boolean) => { void session.doExportRegionsYaml(includeManual); },
    closeValidation: () => session.setValidationDialog(null),
    closeMetrics: () => setShowMetrics(false),
    openRegionDetails,
    closeLegend: () => setShowLegend(false),
    closeSearch: () => setShowSearch(false),
    focusRegion,
    closeFlagTree: () => setShowFlagTreeDialog(false),
    applyHighlightFlag: (name: string | null) => highlights.applyHighlightFlag(name),
    closeFlagsManager,
    handleUpdateFlags: mutations.handleUpdateFlags,
    handleBulkFlags: mutations.handleBulkFlags,
    handleClearAllFlags: mutations.handleClearAllFlags,
    openFlagsCatalog: () => setShowFlagsCatalog(true),
    setFlagsCatalog,
    setScheme: session.setScheme,
    closeFlagsCatalog: () => setShowFlagsCatalog(false),
    handleAddManual: mutations.handleAddManual,
    closeAddDialog,
    handleRename: mutations.handleRename,
    closeRename: () => setRenameTargetId(null),
    handleConfirmDeleteManual: mutations.handleConfirmDeleteManual,
    closeDelete: () => setDeleteTarget(null),
    closeFlagConflicts: () => setShowFlagConflictsDialog(false),
    showConflictOnScheme: highlights.showConflictOnScheme,
    showOverwriteOnScheme: highlights.showOverwriteOnScheme,
    dismissAllToasts: notifications.dismissAllToasts,
    openNotificationOnScheme: highlights.openNotificationOnScheme,
    setShowClearConfirm: session.setShowClearConfirm,
    setShowResetConfirm: session.setShowResetConfirm,
    setShowOpenFileConfirm: session.setShowOpenFileConfirm,
    setShowExportManualConfirm: session.setShowExportManualConfirm,
  }), [
    session,
    openRegionDetails,
    focusRegion,
    highlights,
    closeFlagsManager,
    mutations,
    closeAddDialog,
    notifications,
  ]);

  const onBackgroundTap = clearSelection;
  const onRename = useCallback((id: string) => setRenameTargetId(id), []);
  const onAddManual = useCallback(() => openAddDialog(), [openAddDialog]);
  const onOpenFlagsManagerNode = useCallback((id: string) => openFlagsManager(id), [openFlagsManager]);
  const onCollapseChildren = useCallback((id: string) => onContextCollapse(id, true), [onContextCollapse]);
  const onExpandChildren = useCallback((id: string) => onContextCollapse(id, false), [onContextCollapse]);
  const onCollapseRecursive = useCallback((id: string) => onContextCollapseRecursive(id, true), [onContextCollapseRecursive]);
  const onExpandRecursive = useCallback((id: string) => onContextCollapseRecursive(id, false), [onContextCollapseRecursive]);

  const blockBrowserMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <div className="app">
      {!sidebarCollapsed && (
        <AppSidebar
          sidebarWidth={sidebarWidth}
          beginResize={beginResize}
          status={session.status}
          busyMessage={session.busyMessage}
          hasScheme={hasScheme}
          schemeActionsDisabled={schemeActionsDisabled}
          emptySchemeChrome={emptySchemeChrome}
          collapseThreshold={collapse.collapseThreshold}
          setCollapseThreshold={collapse.setCollapseThreshold}
          flagsCatalogEmpty={flagsCatalog.length === 0}
          exportBlockedFlashTick={notifications.exportBlockedFlashTick}
          exportBlockedFlashCount={notifications.exportBlockedFlashCount}
          onOpenFile={session.handleOpenFileClick}
          onSaveScheme={() => { void session.handleSaveScheme(); }}
          onExportYaml={() => session.handleExportRegionsYaml()}
          onOpenFlagsManager={() => openFlagsManager()}
          onOpenFlagsCatalog={() => setShowFlagsCatalog(true)}
          onOpenFlagConflicts={() => setShowFlagConflictsDialog(true)}
          onOpenMetrics={() => setShowMetrics(true)}
          onOpenChangelog={whatsNew.openChangelog}
          onResetScheme={() => session.setShowResetConfirm(true)}
          onClearScheme={() => session.setShowClearConfirm(true)}
        />
      )}

      <AppDialogs
        scheme={session.scheme}
        flagsCatalog={flagsCatalog}
        flagConflicts={flagConflicts}
        regionIdList={regionIdList}
        parentMap={parentMap}
        showClearConfirm={session.showClearConfirm}
        showResetConfirm={session.showResetConfirm}
        showOpenFileConfirm={session.showOpenFileConfirm}
        showExportManualConfirm={session.showExportManualConfirm}
        validationDialog={session.validationDialog}
        showMetrics={showMetrics}
        showLegend={showLegend}
        showSearch={showSearch}
        showFlagTreeDialog={showFlagTreeDialog}
        showFlagsManager={showFlagsManager}
        flagsManagerFocusId={flagsManagerFocusId}
        flagsManagerFilterFlag={flagsManagerFilterFlag}
        showFlagsCatalog={showFlagsCatalog}
        showAddDialog={showAddDialog}
        addDialogInitialParent={addDialogInitialParent}
        renameTargetId={renameTargetId}
        deleteTarget={deleteTarget}
        showFlagConflictsDialog={showFlagConflictsDialog}
        notificationToasts={notifications.notificationToasts}
        actions={dialogActions}
      />

      <main className="graph-area" onContextMenu={blockBrowserMenu}>
        {session.scheme ? (
          <ErrorBoundary>
            <GraphView
              ref={graphRef}
              scheme={session.scheme}
              hiddenNodes={collapse.hiddenNodes}
              orphanIds={session.orphanIds}
              selectedId={camera.selectedId}
              baseSize={baseSize}
              focusRequest={camera.focusRequest}
              centerRequest={camera.centerRequest}
              fitRequest={camera.fitRequest}
              viewResetRequest={camera.viewResetRequest}
              layoutRequest={camera.layoutRequest}
              locked={camera.graphLocked}
              conflictRegionIds={conflictRegionIds}
              flagHighlight={highlights.flagHighlight}
              attentionBrightIds={highlights.attentionBrightIds}
              attentionBrightEdgeKeys={highlights.attentionBrightEdgeKeys}
              subtreeHighlightActive={Boolean(highlights.subtreeHighlightRoot)}
              edgeDisplayFilters={edgeDisplayFilters}
              onNodeSelect={onNodeSelect}
              onNodeOpen={onNodeOpen}
              onBackgroundTap={onBackgroundTap}
              onCopyName={onCopyName}
              onRename={onRename}
              onAddManual={onAddManual}
              onAddDescendant={onAddDescendant}
              onDeleteManual={mutations.requestDeleteManual}
              onOpenFlagsManager={onOpenFlagsManagerNode}
              onCollapseChildren={onCollapseChildren}
              onExpandChildren={onExpandChildren}
              onCollapseRecursive={onCollapseRecursive}
              onExpandRecursive={onExpandRecursive}
              onHighlightSubtree={highlights.highlightSubtree}
              onClearSubtreeHighlight={highlights.clearSubtreeHighlight}
            />
            <GraphChromeControls
              graphRef={graphRef}
              sidebarCollapsed={sidebarCollapsed}
              busyMessage={session.busyMessage}
              highlightFlag={highlights.highlightFlag}
              collapseTarget={collapse.collapseTarget}
              flagsCatalog={flagsCatalog}
              notifications={notifications.notifications}
              showNotifications={notifications.showNotifications}
              graphLocked={camera.graphLocked}
              subtreeHighlightRoot={highlights.subtreeHighlightRoot}
              problemFilter={highlights.problemFilter}
              flagHighlightShowIntersects={highlights.flagHighlightShowIntersects}
              flagHighlightShowContains={highlights.flagHighlightShowContains}
              flagHighlightShowInheritance={highlights.flagHighlightShowInheritance}
              flagHighlightShowConflicts={highlights.flagHighlightShowConflicts}
              showFlagHighlightOptsMenu={highlights.showFlagHighlightOptsMenu}
              showEdgeModeMenu={highlights.showEdgeModeMenu}
              showProblemsMenu={highlights.showProblemsMenu}
              edgeDisplayFilters={edgeDisplayFilters}
              isFullscreen={isFullscreen}
              actions={chromeActions}
            />
          </ErrorBoundary>
        ) : (
          <EmptySchemeChrome
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={toggleSidebarCollapsed}
          />
        )}
      </main>

      {detailsRegion && (
        <RegionPanel
          region={detailsRegion}
          childIds={detailsChildIds}
          spatialRelations={detailsSpatialRelations}
          spatialEdges={session.scheme?.spatialEdges ?? []}
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
          onDeleteManual={mutations.requestDeleteManual}
          canDelete
          onUpdateParent={mutations.handleUpdateParent}
          onUpdateFlags={mutations.handleUpdateFlags}
          onUpdateGeometry={mutations.handleUpdateGeometry}
          onRequestRename={(id) => setRenameTargetId(id)}
          onUpdatePriority={mutations.handleUpdatePriority}
          onUpdateMembers={mutations.handleUpdateMembers}
          onShowFlagOnScheme={(flagName) => {
            closeRegionDetails();
            highlights.applyHighlightFlag(flagName);
          }}
        />
      )}

      {session.busyMessage && (
        <div className="busy-overlay" role="alert" aria-busy="true">
          <div className="busy-spinner" />
          <p className="busy-overlay-message">{session.busyMessage}</p>
        </div>
      )}
      {serverDown && (
        <div className="server-down-overlay" role="alert" aria-live="assertive">
          <p className="server-down-title">{t('server.downTitle')}</p>
          <p className="server-down-body">{t('server.downBody')}</p>
        </div>
      )}
      {whatsNew.dialog}
    </div>
  );
}
