import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppNotification } from '../components/NotificationsBell';
import type { HighlightBranchMode } from '../components/GraphView';
import type { FlagInfo, Scheme } from '../types';
import type { FlagConflictsResult, SpatialConflict } from '../utils/flagConflicts';
import {
  attachConflictInheritancePaths,
  attachFlagConflicts,
  buildFlagHighlight,
  conflictHighlightFitIds,
  enrichHighlightWithFlagValues,
  mergeConflictInheritancePaths,
} from '../utils/flagTree';
import {
  buildParentMap,
  collectContainmentChain,
  collectDescendants,
  collectHighlightEdgeKeys,
  collectIntersectsPartners,
  collectParentChain,
  findForestNode,
  revealPathToNode,
} from '../utils/graph';
import type { TranslationKey } from '../i18n/translations';
import { useI18n } from '../i18n/I18nContext';

type OverwriteView = {
  flagName: string;
  parentId: string;
  childId: string;
} | null;

type SetHidden = React.Dispatch<React.SetStateAction<Set<string>>>;
type SetSelected = React.Dispatch<React.SetStateAction<string | null>>;
type FitIds = (ids: string[]) => void;

/**
 * Flag highlight layers, conflict/overwrite scheme view, subtree highlight, problems mode.
 */
export function useGraphHighlights(
  scheme: Scheme | null,
  flagsCatalog: FlagInfo[],
  flagConflicts: FlagConflictsResult | null,
  orphanIds: Set<string>,
  nonStandardHeightIds: Set<string>,
  hiddenNodes: Set<string>,
  requestFitOnIds: FitIds,
  setHiddenNodes: SetHidden,
  setSelectedId: SetSelected,
  setCollapseTarget: SetSelected,
  setFitRequest: React.Dispatch<React.SetStateAction<{ ids: string[]; seq: number } | null>>,
  pushInfoToast: (toast: AppNotification) => void,
  markNotificationRead: (id: string) => void,
  setShowNotifications: (v: boolean) => void,
  setShowFlagConflictsDialog: (v: boolean) => void,
  closeFlagsManager: () => void,
  focusRegion: (regionId: string) => void,
  setStatus: (msg: string) => void,
) {
  const { t } = useI18n();
  const [highlightFlag, setHighlightFlag] = useState<string | null>(null);
  const [conflictSchemeView, setConflictSchemeView] = useState<SpatialConflict | null>(null);
  const [overwriteSchemeView, setOverwriteSchemeView] = useState<OverwriteView>(null);
  const [problemFilter, setProblemFilter] = useState<'error' | 'warning' | null>(null);
  const [showProblemsMenu, setShowProblemsMenu] = useState(false);
  const [subtreeHighlightRoot, setSubtreeHighlightRoot] = useState<string | null>(null);
  const [subtreeHighlightIds, setSubtreeHighlightIds] = useState<Set<string> | null>(null);
  const [subtreeHighlightMode, setSubtreeHighlightMode] = useState<HighlightBranchMode | null>(null);
  const [flagHighlightShowIntersects, setFlagHighlightShowIntersects] = useState(false);
  const [flagHighlightShowContains, setFlagHighlightShowContains] = useState(false);
  const [flagHighlightShowInheritance, setFlagHighlightShowInheritance] = useState(false);
  const [flagHighlightShowConflicts, setFlagHighlightShowConflicts] = useState(false);
  const [showFlagHighlightOptsMenu, setShowFlagHighlightOptsMenu] = useState(false);
  const [showEdgeModeMenu, setShowEdgeModeMenu] = useState(false);

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

  // Keep focused conflict in sync when priority/values change (amb → resolved).
  useEffect(() => {
    if (!flagConflicts) return;
    setConflictSchemeView((current) => {
      if (!current) return current;
      const match = flagConflicts.spatialConflicts.find(
        (c) => c.flagName === current.flagName
          && c.aId === current.aId
          && c.bId === current.bId
          && c.relation === current.relation,
      );
      if (!match) return null;
      if (
        match.ambiguous === current.ambiguous
        && match.winnerId === current.winnerId
        && match.aPriority === current.aPriority
        && match.bPriority === current.bPriority
      ) {
        return current;
      }
      return match;
    });
  }, [flagConflicts]);

  const toggleBottomLeftMenu = useCallback((which: 'flagOpts' | 'edge' | 'problems') => {
    setShowFlagHighlightOptsMenu((open) => (which === 'flagOpts' ? !open : false));
    setShowEdgeModeMenu((open) => (which === 'edge' ? !open : false));
    setShowProblemsMenu((open) => (which === 'problems' ? !open : false));
  }, []);

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
      const pairIds = new Set([conflictSchemeView.aId, conflictSchemeView.bId]);
      const pairEdgeKeys = new Set([
        `${conflictSchemeView.relation}-${conflictSchemeView.aId}-${conflictSchemeView.bId}`,
        `${conflictSchemeView.relation}-${conflictSchemeView.bId}-${conflictSchemeView.aId}`,
      ]);
      withConflict = {
        ...attachConflictInheritancePaths(
          base,
          scheme,
          conflictSchemeView.aId,
          conflictSchemeView.bId,
        ),
        ...(conflictSchemeView.ambiguous
          ? { conflictIds: pairIds, conflictEdgeKeys: pairEdgeKeys }
          : { resolvedConflictIds: pairIds, resolvedConflictEdgeKeys: pairEdgeKeys }),
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

  const clearSubtreeOnly = useCallback(() => {
    setSubtreeHighlightRoot(null);
    setSubtreeHighlightIds(null);
    setSubtreeHighlightMode(null);
  }, []);

  const clearSpecialHighlight = useCallback(() => {
    setHighlightFlag(null);
    setConflictSchemeView(null);
    setOverwriteSchemeView(null);
    clearSubtreeOnly();
    setProblemFilter(null);
    setShowProblemsMenu(false);
    setFitRequest(null);
    setFlagHighlightShowIntersects(false);
    setFlagHighlightShowContains(false);
    setFlagHighlightShowInheritance(false);
    setFlagHighlightShowConflicts(false);
    setShowFlagHighlightOptsMenu(false);
    setStatus(t('status.specialHighlightCleared'));
  }, [clearSubtreeOnly, setFitRequest, setStatus, t]);

  const clearSubtreeHighlight = useCallback(() => {
    clearSubtreeOnly();
    setFitRequest(null);
    setStatus(t('status.subtreeHighlightCleared'));
  }, [clearSubtreeOnly, setFitRequest, setStatus, t]);

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
      pushInfoToast({
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
      });
      return;
    }

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
  }, [scheme, requestFitOnIds, pushInfoToast, setSelectedId, setCollapseTarget, setStatus, t]);

  const setProblemsMode = useCallback((mode: 'error' | 'warning' | null) => {
    setHighlightFlag(null);
    setConflictSchemeView(null);
    setOverwriteSchemeView(null);
    clearSubtreeOnly();
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
  }, [t, scheme, flagConflicts, orphanIds, nonStandardHeightIds, requestFitOnIds, clearSubtreeOnly, setStatus]);

  const applyHighlightFlag = useCallback((name: string | null) => {
    clearSubtreeOnly();
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
  }, [scheme, requestFitOnIds, flagConflicts, clearSubtreeOnly, setHiddenNodes]);

  /** Unified entry for showing a spatial conflict on the scheme (dialog / notification). */
  const showConflictOnScheme = useCallback((conflict: SpatialConflict) => {
    if (!scheme) return;
    setShowFlagConflictsDialog(false);
    closeFlagsManager();
    clearSubtreeOnly();
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
  }, [
    scheme,
    closeFlagsManager,
    clearSubtreeOnly,
    setHiddenNodes,
    setSelectedId,
    setCollapseTarget,
    requestFitOnIds,
    setShowFlagConflictsDialog,
  ]);

  const showOverwriteOnScheme = useCallback((overwrite: {
    flagName: string;
    parentId: string;
    childId: string;
  }) => {
    if (!scheme) return;
    setShowFlagConflictsDialog(false);
    closeFlagsManager();
    clearSubtreeOnly();
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
  }, [
    scheme,
    closeFlagsManager,
    clearSubtreeOnly,
    setHiddenNodes,
    setSelectedId,
    setCollapseTarget,
    requestFitOnIds,
    setShowFlagConflictsDialog,
  ]);

  const openNotificationOnScheme = useCallback((n: AppNotification) => {
    markNotificationRead(n.id);
    setShowNotifications(false);
    setShowFlagConflictsDialog(false);
    closeFlagsManager();

    if (n.kind === 'update') {
      if (n.url) window.open(n.url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (n.kind === 'info') {
      if (n.aId) focusRegion(n.aId);
      return;
    }

    clearSubtreeOnly();
    setProblemFilter(null);
    setShowProblemsMenu(false);

    if ((n.kind === 'orphan' || n.kind === 'height' || n.kind === 'invalidId' || n.kind === 'incompleteManual') && n.aId) {
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
  }, [
    flagConflicts,
    scheme,
    requestFitOnIds,
    focusRegion,
    markNotificationRead,
    setShowNotifications,
    setShowFlagConflictsDialog,
    closeFlagsManager,
    clearSubtreeOnly,
    setHiddenNodes,
    setSelectedId,
    setCollapseTarget,
  ]);

  const clearCameraSideHighlights = useCallback(() => {
    clearSubtreeOnly();
    setProblemFilter(null);
    setShowProblemsMenu(false);
  }, [clearSubtreeOnly]);

  const resetHighlightState = useCallback(() => {
    setHighlightFlag(null);
    setConflictSchemeView(null);
    setOverwriteSchemeView(null);
    clearSubtreeOnly();
    setProblemFilter(null);
    setShowProblemsMenu(false);
    setFlagHighlightShowIntersects(false);
    setFlagHighlightShowContains(false);
    setFlagHighlightShowInheritance(false);
    setFlagHighlightShowConflicts(false);
    setShowFlagHighlightOptsMenu(false);
    setShowEdgeModeMenu(false);
  }, [clearSubtreeOnly]);

  return {
    highlightFlag,
    setHighlightFlag,
    conflictSchemeView,
    setConflictSchemeView,
    overwriteSchemeView,
    setOverwriteSchemeView,
    problemFilter,
    showProblemsMenu,
    subtreeHighlightRoot,
    subtreeHighlightMode,
    flagHighlightShowIntersects,
    setFlagHighlightShowIntersects,
    flagHighlightShowContains,
    setFlagHighlightShowContains,
    flagHighlightShowInheritance,
    setFlagHighlightShowInheritance,
    flagHighlightShowConflicts,
    setFlagHighlightShowConflicts,
    showFlagHighlightOptsMenu,
    showEdgeModeMenu,
    toggleBottomLeftMenu,
    flagHighlight,
    attentionBrightIds,
    attentionBrightEdgeKeys,
    clearSpecialHighlight,
    clearSubtreeHighlight,
    clearCameraSideHighlights,
    highlightSubtree,
    setProblemsMode,
    applyHighlightFlag,
    showConflictOnScheme,
    showOverwriteOnScheme,
    openNotificationOnScheme,
    resetHighlightState,
  };
}
