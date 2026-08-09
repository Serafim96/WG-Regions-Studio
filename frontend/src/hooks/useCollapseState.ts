import { useCallback, useEffect, useState } from 'react';
import type { ForestNode, Scheme } from '../types';
import {
  collectDescendants,
  findForestNode,
} from '../utils/graph';
import {
  computeCollapseAllHidden,
  computeDefaultHiddenNodes,
  computeExpandAllHidden,
} from '../utils/layout';
import { loadAppSettings, saveAppSettings } from '../utils/settings';
import { loadViewState, saveViewState } from '../utils/viewState';

type CameraClear = () => void;
type FitIds = (ids: string[]) => void;

/**
 * Collapse / expand / hiddenNodes + threshold + view-state persistence.
 */
export function useCollapseState(
  scheme: Scheme | null,
  requestFitOnIds: FitIds,
  clearCameraRequests: CameraClear,
  schemeKeyRef: React.MutableRefObject<string>,
  isFreshSchemeRef: React.MutableRefObject<boolean>,
) {
  const initialSettings = loadAppSettings();
  const [hiddenNodes, setHiddenNodes] = useState<Set<string>>(new Set());
  const [collapseThreshold, setCollapseThreshold] = useState(initialSettings.collapseThreshold);
  const [collapseTarget, setCollapseTarget] = useState<string | null>(null);

  useEffect(() => {
    saveAppSettings({ ...loadAppSettings(), collapseThreshold });
  }, [collapseThreshold]);

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
  }, [scheme?.sourceHash, schemeKeyRef, isFreshSchemeRef]);

  useEffect(() => {
    if (!scheme) return;
    saveViewState(schemeKeyRef.current, {
      hiddenNodes: Array.from(hiddenNodes),
      collapseTarget,
    });
  }, [scheme, hiddenNodes, collapseTarget, schemeKeyRef]);

  const applyDefaultHidden = useCallback((next: Scheme, threshold: number) => {
    const defaults = computeDefaultHiddenNodes(next, threshold);
    setHiddenNodes(defaults);
    return defaults.size;
  }, []);

  const toggleChildren = useCallback((regionId: string, hide: boolean) => {
    if (!scheme) return;
    const node = findForestNode(scheme, regionId);
    if (!node) return;
    const childIds = node.children.map((c: ForestNode) => c.id);
    let computed: Set<string> | null = null;
    setHiddenNodes((prev) => {
      const next = new Set(prev);
      for (const cid of childIds) {
        if (hide) next.add(cid);
        else next.delete(cid);
      }
      computed = next;
      return next;
    });
    if (computed) {
      const branch = [regionId, ...collectDescendants(node)].filter((id) => !computed!.has(id));
      requestFitOnIds(branch.length > 0 ? branch : [regionId]);
    }
  }, [scheme, requestFitOnIds]);

  const toggleRecursive = useCallback((regionId: string, hide: boolean) => {
    if (!scheme) return;
    const node = findForestNode(scheme, regionId);
    if (!node) return;
    const ids = collectDescendants(node);
    let computed: Set<string> | null = null;
    setHiddenNodes((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (hide) next.add(id);
        else next.delete(id);
      }
      computed = next;
      return next;
    });
    if (computed) {
      const branch = [regionId, ...collectDescendants(node)].filter((id) => !computed!.has(id));
      requestFitOnIds(branch.length > 0 ? branch : [regionId]);
    }
  }, [scheme, requestFitOnIds]);

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

  const resetCollapseState = useCallback(() => {
    setHiddenNodes(new Set());
    setCollapseTarget(null);
  }, []);

  return {
    hiddenNodes,
    setHiddenNodes,
    collapseThreshold,
    setCollapseThreshold,
    collapseTarget,
    setCollapseTarget,
    applyDefaultHidden,
    toggleChildren,
    toggleRecursive,
    handleCollapseAll,
    handleExpandAll,
    handleExpandThreshold,
    resetCollapseState,
  };
}
