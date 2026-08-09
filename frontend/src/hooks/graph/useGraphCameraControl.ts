import { useEffect, useRef } from 'react';
import type { Core } from 'cytoscape';
import {
  BUTTON_ZOOM_FACTOR,
  centerNodeOnCy,
  fitNodesOnCy,
  focusNodeOnCy,
  FIT_PADDING,
  applyZoomFloor,
  constrainPan,
  zoomToFitSize,
} from '../../components/graph/camera';

type FocusReq = { id: string; seq: number } | null;
type FitReq = { ids: string[]; seq: number } | null;
type CenterReq = { id: string; seq: number } | null;
type ViewResetReq = { seq: number } | null;
type LayoutReq = { seq: number } | null;

/**
 * Cy-level focus / fit / center request application + imperative handle helpers.
 */
export function useGraphCameraControl(opts: {
  cyRef: React.RefObject<Core | null>;
  focusRequest: FocusReq;
  centerRequest: CenterReq;
  fitRequest: FitReq;
  viewResetRequest: ViewResetReq;
  layoutRequest: LayoutReq;
  fitOnNextLayout: React.MutableRefObject<boolean>;
  viewStateRef: React.MutableRefObject<{ zoom: number; pan: { x: number; y: number } } | null>;
  expandContentSizeRef: React.MutableRefObject<{ w: number; h: number } | null>;
}) {
  const {
    cyRef,
    focusRequest,
    centerRequest,
    fitRequest,
    viewResetRequest,
    layoutRequest,
    fitOnNextLayout,
    viewStateRef,
    expandContentSizeRef,
  } = opts;

  const lastAppliedFocusSeqRef = useRef(0);
  const lastAppliedCenterSeqRef = useRef(0);
  const lastAppliedFitSeqRef = useRef(0);
  const lastViewResetSeqRef = useRef(0);
  const lastLayoutSeqRef = useRef(0);

  useEffect(() => {
    if (!viewResetRequest) return;
    if (viewResetRequest.seq === lastViewResetSeqRef.current) return;
    lastViewResetSeqRef.current = viewResetRequest.seq;
    fitOnNextLayout.current = true;
    viewStateRef.current = null;
  }, [viewResetRequest, fitOnNextLayout, viewStateRef]);

  useEffect(() => {
    if (!layoutRequest) return;
    if (layoutRequest.seq === lastLayoutSeqRef.current) return;
    lastLayoutSeqRef.current = layoutRequest.seq;
    viewStateRef.current = cyRef.current
      ? { zoom: cyRef.current.zoom(), pan: { ...cyRef.current.pan() } }
      : viewStateRef.current;
    fitOnNextLayout.current = false;
  }, [layoutRequest, cyRef, viewStateRef, fitOnNextLayout]);

  useEffect(() => {
    if (!centerRequest || !cyRef.current) return;
    if (centerRequest.seq === lastAppliedCenterSeqRef.current) return;
    const seq = centerRequest.seq;
    const id = centerRequest.id;
    const raf = requestAnimationFrame(() => {
      if (!cyRef.current) return;
      if (seq === lastAppliedCenterSeqRef.current) return;
      lastAppliedCenterSeqRef.current = seq;
      centerNodeOnCy(cyRef.current, id);
    });
    return () => cancelAnimationFrame(raf);
  }, [centerRequest, cyRef]);

  useEffect(() => {
    if (!focusRequest || !cyRef.current) return;
    if (focusRequest.seq === lastAppliedFocusSeqRef.current) return;
    const seq = focusRequest.seq;
    const id = focusRequest.id;
    const raf = requestAnimationFrame(() => {
      if (!cyRef.current) return;
      if (seq === lastAppliedFocusSeqRef.current) return;
      lastAppliedFocusSeqRef.current = seq;
      focusNodeOnCy(cyRef.current, id);
    });
    return () => cancelAnimationFrame(raf);
  }, [focusRequest, cyRef]);

  useEffect(() => {
    if (!fitRequest || !cyRef.current) return;
    if (fitRequest.seq === lastAppliedFitSeqRef.current) return;
    const seq = fitRequest.seq;
    const ids = fitRequest.ids;
    const raf = requestAnimationFrame(() => {
      if (!cyRef.current) return;
      if (seq === lastAppliedFitSeqRef.current) return;
      lastAppliedFitSeqRef.current = seq;
      fitNodesOnCy(cyRef.current, ids);
    });
    return () => cancelAnimationFrame(raf);
  }, [fitRequest, cyRef]);

  return {
    lastAppliedFocusSeqRef,
    lastAppliedCenterSeqRef,
    lastAppliedFitSeqRef,
    makeHandle() {
      return {
        focusNode(regionId: string) {
          const cy = cyRef.current;
          if (!cy) return false;
          return focusNodeOnCy(cy, regionId);
        },
        zoomIn() {
          const cy = cyRef.current;
          if (!cy) return;
          const next = Math.min(cy.zoom() * BUTTON_ZOOM_FACTOR, cy.maxZoom());
          cy.zoom({
            level: next,
            renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
          });
          constrainPan(cy);
        },
        zoomOut() {
          const cy = cyRef.current;
          if (!cy) return;
          const next = Math.max(cy.zoom() / BUTTON_ZOOM_FACTOR, cy.minZoom());
          cy.zoom({
            level: next,
            renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
          });
          constrainPan(cy);
        },
        resize() {
          const cy = cyRef.current;
          if (!cy) return;
          cy.resize();
          const content = expandContentSizeRef.current;
          if (content && cy.width() > 0 && cy.height() > 0) {
            const fitZ = zoomToFitSize(cy.width(), cy.height(), content.w, content.h, FIT_PADDING);
            applyZoomFloor(cy, fitZ);
          } else {
            constrainPan(cy);
          }
        },
      };
    },
  };
}
