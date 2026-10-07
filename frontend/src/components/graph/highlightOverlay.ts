import type { Core } from 'cytoscape';
import { nodeLabelMetrics } from '../../utils/graph';
import { MAX_VALUE_LABEL_LEN } from '../../utils/flagTree';
import type { NodeDimensions } from '../../utils/layout';
import type { FlagHighlightState } from './types';
import { applyRegionNodeStyles } from './nodeStyles';

export const FLAG_NODE_CLASSES = [
  'flag-dim',
  'flag-path',
  'flag-define',
  'flag-contained-no-inherit',
  'flag-intersect-partial',
  'flag-conflict-pair',
  'flag-conflict-pair-resolved',
  'flag-value-define',
  'flag-value-inherit',
  'flag-value-no-inherit',
  'flag-value-intersect',
] as const;

export const FLAG_EDGE_CLASSES = [
  'flag-dim-edge',
  'flag-path-edge',
  'flag-conflict-edge',
  'flag-conflict-resolved-edge',
  'flag-conflict-labeled-edge',
  'flag-conflict-resolved-labeled-edge',
  'flag-no-inherit-edge',
  'flag-intersect-edge',
  'flag-intersect-labeled-edge',
  'flag-contains-labeled-edge',
  'flag-hierarchy-labeled-edge',
] as const;

function clearFlagEdgeLabelData(edge: { removeData: (key: string) => void }): void {
  edge.removeData('intersectLabel');
  edge.removeData('winnerLabel');
  edge.removeData('intersectCenterLabel');
  edge.removeData('intersectSourceLabel');
  edge.removeData('intersectTargetLabel');
  edge.removeData('intersectSourcePct');
  edge.removeData('intersectTargetPct');
}

function applyEdgeEndpointPercents(
  edge: { data: (key: string, value?: string) => unknown },
  keysToTest: string[],
  flagHighlight: NonNullable<FlagHighlightState>,
): void {
  const endpoints = keysToTest
    .map((k) => flagHighlight.intersectEdgeEndpoints?.get(k))
    .find(Boolean);
  if (!endpoints) return;
  edge.data('intersectSourcePct', endpoints.sourcePct);
  edge.data('intersectTargetPct', endpoints.targetPct);
}

export function flagValueSuffix(
  valueInfo: { text: string; defining: boolean } | undefined,
): string {
  if (!valueInfo) return '';
  if (valueInfo.text.startsWith('∈') || valueInfo.text.startsWith('≈')) {
    return `\n${valueInfo.text}`;
  }
  return valueInfo.defining ? `\n◆ ${valueInfo.text}` : `\n◇ ${valueInfo.text}`;
}

export function sizedManualNode(
  metrics: { width: number; height: number },
  manual: boolean,
  regionType: string,
): { width: number; height: number } {
  let { width, height } = metrics;
  if (manual && regionType !== 'global') {
    width = Math.max(metrics.width, metrics.height * 1.4);
    height = Math.max(metrics.height * 0.72, metrics.width * 0.5);
    width = Math.max(width, metrics.width);
    height = Math.max(height, metrics.height);
  }
  return { width, height };
}

/** Worst-case value line so flag-mode layout does not grow when inheritance turns on. */
export function reservedFlagValueSuffix(): string {
  return `\n◆ ${'W'.repeat(MAX_VALUE_LABEL_LEN)}`;
}

export function nodeBoxForLabel(
  baseLabel: string,
  depth: number,
  baseSize: number,
  manual: boolean,
  regionType: string,
  reserveFlagValue: boolean,
): { width: number; height: number; fontSize: number; textMaxWidth: number } {
  const label = reserveFlagValue
    ? `${baseLabel}${reservedFlagValueSuffix()}`
    : baseLabel;
  const metrics = nodeLabelMetrics(label, depth, baseSize, {
    denseText: reserveFlagValue,
    valueEmphasis: reserveFlagValue,
  });
  const sized = sizedManualNode(metrics, manual, regionType);
  return {
    ...sized,
    fontSize: metrics.fontSize,
    textMaxWidth: Math.max(metrics.textMaxWidth, sized.width - 14),
  };
}

/**
 * Apply / clear flag & attention highlight classes and value captions in place.
 * Does not move nodes — layout stays stable while toggling highlight layers.
 */
export function applyHighlightOverlay(
  cy: Core,
  flagHighlight: FlagHighlightState,
  attentionBrightIds: Set<string> | null,
  attentionBrightEdgeKeys: Set<string> | null,
  baseSize: number,
): void {
  const flagNodeClassStr = FLAG_NODE_CLASSES.join(' ');
  const flagEdgeClassStr = FLAG_EDGE_CLASSES.join(' ');

  cy.batch(() => {
    cy.nodes().forEach((node) => {
      node.removeClass(flagNodeClassStr);
      const regionId = node.id();
      const baseLabel = String(node.data('baseLabel') ?? node.data('label') ?? '');
      const depth = Number(node.data('depth')) || 0;
      const regionType = String(node.data('regionType') ?? '');
      const manual = Boolean(node.data('isManual'));
      const valueInfo = flagHighlight?.valueLabels?.get(regionId);
      const label = `${baseLabel}${flagValueSuffix(valueInfo)}`;
      const layoutWidth = Number(node.data('layoutWidth'));
      const layoutHeight = Number(node.data('layoutHeight'));
      let width: number;
      let height: number;
      let fontSize: number;
      let textMaxWidth: number;
      if (flagHighlight && layoutWidth > 0 && layoutHeight > 0) {
        width = layoutWidth;
        height = layoutHeight;
        fontSize = Number(node.data('layoutFontSize')) || Number(node.data('baseFontSize')) || 12;
        textMaxWidth = Number(node.data('layoutTextMaxWidth'))
          || Math.max(8, width - 14);
      } else {
        const metrics = nodeLabelMetrics(label, depth, baseSize, {
          denseText: Boolean(valueInfo),
          valueEmphasis: Boolean(valueInfo),
        });
        const sized = sizedManualNode(metrics, manual, regionType);
        width = sized.width;
        height = sized.height;
        fontSize = metrics.fontSize;
        textMaxWidth = Math.max(metrics.textMaxWidth, width - 14);
      }

      node.data({
        label,
        width,
        height,
        fontSize,
        textMaxWidth,
      });

      if (flagHighlight) {
        const isAmbiguousConflict = flagHighlight.conflictIds?.has(regionId);
        const isResolvedConflict = flagHighlight.resolvedConflictIds?.has(regionId);
        if (isAmbiguousConflict) node.addClass('flag-conflict-pair');
        else if (isResolvedConflict) node.addClass('flag-conflict-pair-resolved');
        if (flagHighlight.definingIds.has(regionId)) node.addClass('flag-define');
        else if (flagHighlight.brightIds.has(regionId)) node.addClass('flag-path');
        else if (flagHighlight.containedNoInheritIds?.has(regionId)) {
          node.addClass('flag-contained-no-inherit');
        } else if (flagHighlight.intersectPartialIds?.has(regionId)) {
          node.addClass('flag-intersect-partial');
        } else if (!isAmbiguousConflict && !isResolvedConflict) {
          node.addClass('flag-dim');
        }
        if (valueInfo?.defining) node.addClass('flag-value-define');
        else if (valueInfo) {
          if (flagHighlight.containedNoInheritIds?.has(regionId)) {
            node.addClass('flag-value-no-inherit');
          } else if (flagHighlight.intersectPartialIds?.has(regionId)) {
            node.addClass('flag-value-intersect');
          } else {
            node.addClass('flag-value-inherit');
          }
        }
      } else if (attentionBrightIds) {
        if (!attentionBrightIds.has(regionId)) node.addClass('flag-dim');
      }
    });

    cy.edges().forEach((edge) => {
      edge.removeClass(flagEdgeClassStr);
      clearFlagEdgeLabelData(edge);
      const source = edge.data('source') as string;
      const target = edge.data('target') as string;
      const isHierarchy = edge.hasClass('hierarchy');
      const isContains = edge.hasClass('contains');
      const isIntersects = edge.hasClass('intersects');

      if (flagHighlight) {
        edge.removeData('winnerLabel');
        if (isHierarchy) {
          const edgeKey = `${source}->${target}`;
          if (flagHighlight.brightEdgeKeys.has(edgeKey)) {
            edge.addClass('flag-path-edge');
            const hierarchyLabel = flagHighlight.hierarchyEdgeLabels?.get(edgeKey);
            if (hierarchyLabel) {
              edge.data('intersectLabel', hierarchyLabel);
              edge.addClass('flag-hierarchy-labeled-edge');
            }
          } else edge.addClass('flag-dim-edge');
        } else if (isContains) {
          const relation = 'contains';
          const edgeKey = `${relation}-${source}-${target}`;
          const edgeKeyAlt = `${relation}-${target}-${source}`;
          const origins = (edge.data('origins') as Array<{ source: string; target: string }> | undefined) ?? [];
          const originKeys = (rel: string, list: Array<{ source: string; target: string }>) =>
            list.flatMap((o) => [`${rel}-${o.source}-${o.target}`, `${rel}-${o.target}-${o.source}`]);
          const keysToTest = [edgeKey, edgeKeyAlt, ...originKeys(relation, origins)];
          const hasAny = (set?: Set<string>) => keysToTest.some((k) => set?.has(k));
          // Containment edges stay purple (or dim); warnings/errors apply only to intersects.
          if (hasAny(flagHighlight.containedNoInheritEdgeKeys)) {
            edge.addClass('flag-no-inherit-edge');
            if (flagHighlight.containsEdgeLabels) {
              const labels = keysToTest
                .map((k) => flagHighlight.containsEdgeLabels!.get(k))
                .filter((v): v is string => Boolean(v));
              const unique = new Set(labels);
              const containsLabel =
                unique.size === 1 ? labels[0] : unique.size > 1 ? `×${unique.size}` : undefined;
              if (containsLabel) {
                edge.data('intersectLabel', containsLabel);
                edge.addClass('flag-contains-labeled-edge');
              }
            }
          } else {
            edge.addClass('flag-dim-edge');
          }
        } else if (isIntersects) {
          const relation = 'intersects';
          const edgeKey = `${relation}-${source}-${target}`;
          const edgeKeyAlt = `${relation}-${target}-${source}`;
          const origins = (edge.data('origins') as Array<{ source: string; target: string }> | undefined) ?? [];
          const originKeys = (rel: string, list: Array<{ source: string; target: string }>) =>
            list.flatMap((o) => [`${rel}-${o.source}-${o.target}`, `${rel}-${o.target}-${o.source}`]);
          const keysToTest = [edgeKey, edgeKeyAlt, ...originKeys(relation, origins)];
          const hasAny = (set?: Set<string>) => keysToTest.some((k) => set?.has(k));
          const isAmbiguousConflict = hasAny(flagHighlight.conflictEdgeKeys);
          const isResolvedConflict = hasAny(flagHighlight.resolvedConflictEdgeKeys);
          if (isAmbiguousConflict) {
            edge.addClass('flag-conflict-edge');
            const amb = keysToTest.map((k) => flagHighlight.ambiguousEdgeLabels?.get(k)).find(Boolean);
            if (amb) {
              edge.data('intersectLabel', amb);
              edge.addClass('flag-conflict-labeled-edge');
              applyEdgeEndpointPercents(edge, keysToTest, flagHighlight);
            } else {
              edge.removeData('intersectLabel');
            }
          } else if (isResolvedConflict) {
            edge.addClass('flag-conflict-resolved-edge');
            const winner = keysToTest.map((k) => flagHighlight.resolvedEdgeLabels?.get(k)).find(Boolean);
            if (winner) {
              edge.data('winnerLabel', winner);
              edge.data('intersectLabel', winner);
              edge.addClass('flag-conflict-resolved-labeled-edge');
              applyEdgeEndpointPercents(edge, keysToTest, flagHighlight);
            } else {
              edge.removeData('winnerLabel');
              edge.removeData('intersectLabel');
            }
          } else if (hasAny(flagHighlight.intersectPartialEdgeKeys)) {
            edge.addClass('flag-intersect-edge');
          } else {
            edge.addClass('flag-dim-edge');
          }
          const intersectEdgeLit = hasAny(flagHighlight.intersectPartialEdgeKeys);
          const skipIntersectLabel = isAmbiguousConflict || isResolvedConflict;
          if (isIntersects && flagHighlight.intersectEdgeLabels && intersectEdgeLit && !skipIntersectLabel) {
            const labels = keysToTest
              .map((k) => flagHighlight.intersectEdgeLabels!.get(k))
              .filter((v): v is string => Boolean(v));
            const unique = new Set(labels);
            const intersectLabel =
              unique.size === 1 ? labels[0] : unique.size > 1 ? `×${unique.size}` : undefined;
            if (intersectLabel) {
              edge.data('intersectLabel', intersectLabel);
              edge.addClass('flag-intersect-labeled-edge');
              applyEdgeEndpointPercents(edge, keysToTest, flagHighlight);
            } else {
              edge.removeData('intersectLabel');
              edge.removeData('intersectCenterLabel');
              edge.removeData('intersectSourceLabel');
              edge.removeData('intersectTargetLabel');
            }
          } else if (isIntersects && !skipIntersectLabel) {
            edge.removeData('intersectLabel');
            edge.removeData('intersectCenterLabel');
            edge.removeData('intersectSourceLabel');
            edge.removeData('intersectTargetLabel');
          }
        }
      } else if (attentionBrightIds) {
        if (isHierarchy) {
          const edgeKey = `${source}->${target}`;
          const bothBright = attentionBrightIds.has(source) && attentionBrightIds.has(target);
          if (!bothBright) {
            edge.addClass('flag-dim-edge');
          } else if (attentionBrightEdgeKeys && !attentionBrightEdgeKeys.has(edgeKey)) {
            edge.addClass('flag-dim-edge');
          }
        } else if (isContains || isIntersects) {
          const relation = isContains ? 'contains' : 'intersects';
          const edgeKey = `${relation}-${source}-${target}`;
          const edgeKeyAlt = `${relation}-${target}-${source}`;
          if (attentionBrightEdgeKeys) {
            if (
              !attentionBrightEdgeKeys.has(edgeKey)
              && !attentionBrightEdgeKeys.has(edgeKeyAlt)
            ) {
              edge.addClass('flag-dim-edge');
            }
          } else if (
            !attentionBrightIds.has(source)
            || !attentionBrightIds.has(target)
          ) {
            edge.addClass('flag-dim-edge');
          }
        }
      }
    });
  });

  applyRegionNodeStyles(cy);
}

// Re-export for layout sizing callers
export type { NodeDimensions };
