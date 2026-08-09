import { useCallback, useRef, useState } from 'react';
import type { Scheme } from '../types';
import { buildParentMap, revealPathToNode } from '../utils/graph';

/**
 * Camera request bus (focus / center / fit / viewReset / layout) + focusRegion.
 * `centerRequest` is kept even if mostly cleared — see `_ideas/centerRequest.md`.
 */
export function useGraphCamera() {
  const schemeRef = useRef<Scheme | null>(null);
  const focusSeqRef = useRef(0);
  const fitSeqRef = useRef(0);
  const viewResetSeqRef = useRef(0);
  const layoutSeqRef = useRef(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [graphLocked, setGraphLocked] = useState(true);
  const [focusRequest, setFocusRequest] = useState<{ id: string; seq: number } | null>(null);
  const [centerRequest, setCenterRequest] = useState<{ id: string; seq: number } | null>(null);
  const [fitRequest, setFitRequest] = useState<{ ids: string[]; seq: number } | null>(null);
  const [viewResetRequest, setViewResetRequest] = useState<{ seq: number } | null>(null);
  const [layoutRequest, setLayoutRequest] = useState<{ seq: number } | null>(null);

  const setSchemeRef = useCallback((scheme: Scheme | null) => {
    schemeRef.current = scheme;
  }, []);

  const requestFitOnIds = useCallback((ids: string[]) => {
    fitSeqRef.current += 1;
    setCenterRequest(null);
    setFocusRequest(null);
    setFitRequest({ ids, seq: fitSeqRef.current });
  }, []);

  const focusRegion = useCallback((
    regionId: string,
    setHiddenNodes: React.Dispatch<React.SetStateAction<Set<string>>>,
  ) => {
    const scheme = schemeRef.current;
    if (!scheme) return;
    const parentMap = buildParentMap(scheme.regions);
    setHiddenNodes((prev) => revealPathToNode(regionId, prev, parentMap));
    setSelectedId(regionId);
    // Focus must win over a stale expand/collapse centerRequest.
    setCenterRequest(null);
    setFitRequest(null);
    focusSeqRef.current += 1;
    setFocusRequest({ id: regionId, seq: focusSeqRef.current });
  }, []);

  const clearCameraRequests = useCallback(() => {
    setFocusRequest(null);
    setCenterRequest(null);
    setFitRequest(null);
    setSelectedId(null);
    viewResetSeqRef.current += 1;
    setViewResetRequest({ seq: viewResetSeqRef.current });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
  }, []);

  const requestLayout = useCallback(() => {
    layoutSeqRef.current += 1;
    setLayoutRequest({ seq: layoutSeqRef.current });
  }, []);

  const focusAfterAdd = useCallback((regionId: string) => {
    setSelectedId(regionId);
    setCenterRequest(null);
    focusSeqRef.current += 1;
    setFocusRequest({ id: regionId, seq: focusSeqRef.current });
  }, []);

  const resetCameraState = useCallback(() => {
    setGraphLocked(true);
    setFocusRequest(null);
    setCenterRequest(null);
    setFitRequest(null);
    setViewResetRequest(null);
    setLayoutRequest(null);
    setSelectedId(null);
  }, []);

  return {
    selectedId,
    setSelectedId,
    graphLocked,
    setGraphLocked,
    focusRequest,
    centerRequest,
    setCenterRequest,
    fitRequest,
    setFitRequest,
    viewResetRequest,
    layoutRequest,
    requestFitOnIds,
    focusRegion,
    clearCameraRequests,
    clearSelection,
    requestLayout,
    focusAfterAdd,
    resetCameraState,
    setSchemeRef,
  };
}
