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
  'flag-value-define',
  'flag-value-inherit',
  'flag-value-no-inherit',
  'flag-value-intersect',
] as const;

export const FLAG_EDGE_CLASSES = [
  'flag-dim-edge',
  'flag-path-edge',
  'flag-conflict-edge',
  'flag-no-inherit-edge',
  'flag-intersect-edge',
] as const;

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
        if (flagHighlight.conflictIds?.has(regionId)) node.addClass('flag-conflict-pair');
        if (flagHighlight.definingIds.has(regionId)) node.addClass('flag-define');
        else if (flagHighlight.brightIds.has(regionId)) node.addClass('flag-path');
        else if (flagHighlight.containedNoInheritIds?.has(regionId)) {
          node.addClass('flag-contained-no-inherit');
        } else if (flagHighlight.intersectPartialIds?.has(regionId)) {
          node.addClass('flag-intersect-partial');
        } else if (!flagHighlight.conflictIds?.has(regionId)) {
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
      const source = edge.data('source') as string;
      const target = edge.data('target') as string;
      const isHierarchy = edge.hasClass('hierarchy');
      const isContains = edge.hasClass('contains');
      const isIntersects = edge.hasClass('intersects');

      if (flagHighlight) {
        if (isHierarchy) {
          const edgeKey = `${source}->${target}`;
          if (flagHighlight.brightEdgeKeys.has(edgeKey)) edge.addClass('flag-path-edge');
          else edge.addClass('flag-dim-edge');
        } else if (isContains || isIntersects) {
          const relation = isContains ? 'contains' : 'intersects';
          const edgeKey = `${relation}-${source}-${target}`;
          const edgeKeyAlt = `${relation}-${target}-${source}`;
          if (
            flagHighlight.conflictEdgeKeys?.has(edgeKey)
            || flagHighlight.conflictEdgeKeys?.has(edgeKeyAlt)
          ) {
            edge.addClass('flag-conflict-edge');
          } else if (
            flagHighlight.containedNoInheritEdgeKeys?.has(edgeKey)
            || flagHighlight.containedNoInheritEdgeKeys?.has(edgeKeyAlt)
          ) {
            edge.addClass('flag-no-inherit-edge');
          } else if (
            flagHighlight.intersectPartialEdgeKeys?.has(edgeKey)
            || flagHighlight.intersectPartialEdgeKeys?.has(edgeKeyAlt)
          ) {
            edge.addClass('flag-intersect-edge');
          } else {
            edge.addClass('flag-dim-edge');
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
