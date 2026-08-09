import { useEffect, useRef } from 'react';
import type { Core } from 'cytoscape';
import {
  applyZoomFloor,
  constrainPan,
  FIT_PADDING,
  zoomToFitSize,
} from '../../components/graph/camera';

/** Expand-layout bbox cache + resize observer for zoom floor. */
export function useGraphLayout(opts: {
  cyRef: React.RefObject<Core | null>;
  expandContentSizeRef: React.MutableRefObject<{ w: number; h: number } | null>;
  expandLayoutCacheRef: React.MutableRefObject<{
    key: string;
    bb: { w: number; h: number };
  } | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { cyRef, expandContentSizeRef, containerRef } = opts;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
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
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [cyRef, expandContentSizeRef, containerRef]);
}
