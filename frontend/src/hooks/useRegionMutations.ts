import { useCallback } from 'react';
import {
  addManualRegion,
  buildScheme,
  bulkUpdateFlags,
  clearAllRegionFlags,
  deleteManualRegion,
  renameRegion,
  updateRegionFlags,
  updateRegionGeometry,
  updateRegionMembers,
  updateRegionParent,
  updateRegionPriority,
} from '../api';
import type { DeleteChildrenMode } from '../components/DeleteManualRegionDialog';
import type { RegionData, Scheme } from '../types';
import {
  buildParentMap,
  collectDescendants,
  findForestNode,
  revealPathToNode,
} from '../utils/graph';
import { useI18n } from '../i18n/I18nContext';

type ApplyScheme = (next: Scheme, fresh: boolean, threshold: number) => void;

/**
 * Region CRUD: flags/priority/members/parent/geometry/rename/add/delete.
 * Optimistic local patches for flags/priority/members; rebuildScheme for structural edits.
 */
export function useRegionMutations(deps: {
  scheme: Scheme | null;
  setScheme: React.Dispatch<React.SetStateAction<Scheme | null>>;
  collapseThreshold: number;
  applyScheme: ApplyScheme;
  setStatus: (msg: string) => void;
  runBusy: (message: string, fn: () => Promise<void>) => Promise<void>;
  setHiddenNodes: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  setCollapseTarget: React.Dispatch<React.SetStateAction<string | null>>;
  focusAfterAdd: (regionId: string) => void;
  selectedId: string | null;
  detailsId: string | null;
  setDetailsNav: React.Dispatch<React.SetStateAction<{ stack: string[]; index: number } | null>>;
  deleteTarget: { regionId: string; childIds: string[]; parentId: string | null } | null;
  setDeleteTarget: React.Dispatch<React.SetStateAction<{
    regionId: string;
    childIds: string[];
    parentId: string | null;
  } | null>>;
  closeAddDialog: () => void;
  highlightFlag: string | null;
  applyHighlightFlag: (name: string | null) => void;
}) {
  const { t } = useI18n();
  const {
    scheme,
    setScheme,
    collapseThreshold,
    applyScheme,
    setStatus,
    runBusy,
    setHiddenNodes,
    setSelectedId,
    setCollapseTarget,
    focusAfterAdd,
    selectedId,
    detailsId,
    setDetailsNav,
    deleteTarget,
    setDeleteTarget,
    closeAddDialog,
    highlightFlag,
    applyHighlightFlag,
  } = deps;

  const handleAddManual = useCallback(async (data: {
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
        applyScheme(result.scheme, false, collapseThreshold);
        closeAddDialog();
        const parentMap = buildParentMap(result.scheme.regions);
        setHiddenNodes((prev) => revealPathToNode(data.id, prev, parentMap));
        setCollapseTarget(data.id);
        focusAfterAdd(data.id);
        setStatus(t('status.manualAdded', { id: data.id }));
      });
    } catch (err) {
      setStatus(t('status.error', { msg: String(err) }));
    }
  }, [
    runBusy,
    t,
    applyScheme,
    collapseThreshold,
    closeAddDialog,
    setHiddenNodes,
    setCollapseTarget,
    focusAfterAdd,
    setStatus,
  ]);

  const requestDeleteManual = useCallback((regionId: string) => {
    if (!scheme) return;
    const region = scheme.regions.find((r) => r.id === regionId);
    if (!region) return;
    const node = findForestNode(scheme, regionId);
    const childIds = node?.children.map((child) => child.id) ?? [];
    setDeleteTarget({ regionId, childIds, parentId: region.parent ?? null });
  }, [scheme, setDeleteTarget]);

  const handleConfirmDeleteManual = useCallback(async (mode: DeleteChildrenMode) => {
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
      setStatus(t('status.manualDeleted', { id: regionId }));
    } catch (err) {
      setStatus(t('status.error', { msg: String(err) }));
    }
  }, [
    deleteTarget,
    scheme,
    applyScheme,
    collapseThreshold,
    setHiddenNodes,
    selectedId,
    setSelectedId,
    setCollapseTarget,
    detailsId,
    setDetailsNav,
    setDeleteTarget,
    setStatus,
    t,
  ]);

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
  }, [t, setScheme, setStatus]);

  const handleUpdateParent = useCallback(async (
    regionId: string,
    parent: string | null,
  ) => {
    await updateRegionParent(regionId, parent);
    const result = await buildScheme();
    applyScheme(result.scheme, false, collapseThreshold);
    setStatus(t('status.parentUpdated', { id: regionId }));
  }, [t, applyScheme, collapseThreshold, setStatus]);

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
  }, [t, applyScheme, collapseThreshold, setStatus]);

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
    setHiddenNodes((prev) => {
      if (!prev.has(regionId)) return prev;
      const next = new Set(prev);
      next.delete(regionId);
      return next;
    });
    setStatus(t('status.regionRenamed', { oldId: regionId, id: normalized }));
  }, [t, applyScheme, collapseThreshold, setDetailsNav, setSelectedId, setCollapseTarget, setHiddenNodes, setStatus]);

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
  }, [t, setScheme, setStatus]);

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
  }, [t, setScheme, setStatus]);

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
  }, [t, setScheme, setStatus]);

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
  }, [t, highlightFlag, applyHighlightFlag, setScheme, setStatus]);

  return {
    handleAddManual,
    requestDeleteManual,
    handleConfirmDeleteManual,
    handleUpdateFlags,
    handleUpdateParent,
    handleUpdateGeometry,
    handleRename,
    handleUpdatePriority,
    handleUpdateMembers,
    handleBulkFlags,
    handleClearAllFlags,
  };
}
