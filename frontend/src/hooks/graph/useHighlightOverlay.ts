import { useEffect } from 'react';
import type { Core } from 'cytoscape';
import { applyHighlightOverlay } from '../../components/graph/highlightOverlay';
import { updateIntersectEdgeLabels } from '../../components/graph/intersectEdgeLabels';
import type { FlagHighlightState } from '../../components/graph/types';

/** Flag / attention highlight: update classes & captions without re-layout. */
export function useHighlightOverlay(
  cyRef: React.RefObject<Core | null>,
  flagHighlight: FlagHighlightState,
  attentionBrightIds: Set<string> | null,
  attentionBrightEdgeKeys: Set<string> | null,
  baseSize: number,
) {
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    applyHighlightOverlay(
      cy,
      flagHighlight,
      attentionBrightIds,
      attentionBrightEdgeKeys,
      baseSize,
    );
    updateIntersectEdgeLabels(cy);
  }, [cyRef, flagHighlight, attentionBrightIds, attentionBrightEdgeKeys, baseSize]);
}
