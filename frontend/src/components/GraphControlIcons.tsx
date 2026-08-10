/** Inline SVG icons for graph map controls (no icon library). */

/** Default size for scheme map controls (original). */
export const GRAPH_ICON_SIZE = 18;
/** ~20% larger — sidebar / dialog toolbars. */
export const SIDEBAR_ICON_SIZE = 22;
/** Compact tree-row toggles. */
export const TREE_ICON_SIZE = 12;

type SvgIconProps = {
  size?: number;
  className?: string;
};

const strokeSvg = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 18 18',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
  focusable: false as const,
});

/** Filled chevron-pair icons (viewBox matches source double-up-arrow.svg). */
const doubleArrowSvg = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 970.504 970.503',
  fill: 'currentColor',
  'aria-hidden': true as const,
  focusable: false as const,
});

const DOUBLE_UP_PATHS = (
  <>
    <path d="M120.027,962.802c26.6,0,53.5-8.801,75.7-27l288.1-234.7l290.899,237c22.301,18.1,49.101,27,75.7,27c34.8,0,69.4-15.101,93.101-44.2c41.899-51.4,34.1-127-17.2-168.8l-366.7-298.8c-44.1-36-107.5-36-151.6,0l-363.8,296.5c-51.4,41.8-59.1,117.399-17.3,168.8C50.727,947.702,85.227,962.802,120.027,962.802z" />
    <path d="M120.027,541.902c26.6,0,53.5-8.8,75.7-27l288.1-234.7l290.899,237c22.301,18.101,49.101,27,75.7,27c34.8,0,69.4-15.1,93.101-44.2c41.899-51.399,34.1-127-17.2-168.8l-366.7-298.8c-44.1-36-107.5-36-151.6,0l-363.8,296.4c-51.4,41.9-59.1,117.5-17.3,168.9C50.727,526.802,85.227,541.902,120.027,541.902z" />
  </>
);

export function IconZoomIn({ size = GRAPH_ICON_SIZE, className }: SvgIconProps = {}) {
  return (
    <svg {...strokeSvg(size)} className={className}>
      <circle cx="7.5" cy="7.5" r="4.5" />
      <path d="M11 11.5 15 15.5" />
      <path d="M7.5 5.5v4M5.5 7.5h4" />
    </svg>
  );
}

export function IconZoomOut({ size = GRAPH_ICON_SIZE, className }: SvgIconProps = {}) {
  return (
    <svg {...strokeSvg(size)} className={className}>
      <circle cx="7.5" cy="7.5" r="4.5" />
      <path d="M11 11.5 15 15.5" />
      <path d="M5.5 7.5h4" />
    </svg>
  );
}

/** Single chevron for tree expand/collapse rows. */
export function IconTreeChevron({
  expanded,
  size = TREE_ICON_SIZE,
  className,
}: SvgIconProps & { expanded: boolean }) {
  return (
    <svg {...strokeSvg(size)} className={className}>
      {expanded ? (
        <path d="M4.5 7.5 9 12l4.5-4.5" />
      ) : (
        <path d="M7.5 4.5 12 9l-4.5 4.5" />
      )}
    </svg>
  );
}

/** Развернуть — двойная стрелка вниз */
export function IconExpandAll({ size = GRAPH_ICON_SIZE, className }: SvgIconProps = {}) {
  return (
    <svg
      {...doubleArrowSvg(size)}
      className={['graph-icon-double-arrow', 'graph-icon-double-arrow--expand', className]
        .filter(Boolean)
        .join(' ')}
    >
      {DOUBLE_UP_PATHS}
    </svg>
  );
}

/** Свернуть — двойная стрелка вверх */
export function IconCollapseAll({ size = GRAPH_ICON_SIZE, className }: SvgIconProps = {}) {
  return (
    <svg
      {...doubleArrowSvg(size)}
      className={['graph-icon-double-arrow', 'graph-icon-double-arrow--collapse', className]
        .filter(Boolean)
        .join(' ')}
    >
      {DOUBLE_UP_PATHS}
    </svg>
  );
}

export function IconSearch({ size = GRAPH_ICON_SIZE, className }: SvgIconProps = {}) {
  return (
    <svg {...strokeSvg(size)} className={className}>
      <circle cx="8" cy="8" r="4.5" />
      <path d="M11.5 11.5 15 15" />
    </svg>
  );
}

export function IconAdd({ size = GRAPH_ICON_SIZE, className }: SvgIconProps = {}) {
  return (
    <svg {...strokeSvg(size)} className={className}>
      <path d="M9 4v10M4 9h10" />
    </svg>
  );
}

/** Закрытый замок */
export function IconLock({ size = GRAPH_ICON_SIZE, className }: SvgIconProps = {}) {
  return (
    <svg {...strokeSvg(size)} className={className}>
      <rect x="4" y="8" width="10" height="7" rx="1.5" />
      <path d="M6.5 8V6a2.5 2.5 0 0 1 5 0V8" />
      <circle cx="9" cy="11.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Открытый замок — дужка поднята и сдвинута в сторону */
export function IconUnlock({ size = GRAPH_ICON_SIZE, className }: SvgIconProps = {}) {
  return (
    <svg {...strokeSvg(size)} className={className}>
      <rect x="4" y="9" width="10" height="6.5" rx="1.5" />
      <path d="M6.5 9V5.2a2.6 2.6 0 0 1 5.1-.4" />
      <circle cx="9" cy="12.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconLegend({ size = GRAPH_ICON_SIZE, className }: SvgIconProps = {}) {
  return (
    <svg {...strokeSvg(size)} className={className}>
      <rect x="3" y="3.5" width="5" height="4" rx="1" />
      <path d="M10 5.5h5M3 12h12M3 15h8" />
    </svg>
  );
}

export function IconBell({ size = GRAPH_ICON_SIZE, className }: SvgIconProps = {}) {
  return (
    <svg {...strokeSvg(size)} className={className}>
      <path d="M9 2.8a4.2 4.2 0 0 0-4.2 4.2c0 3.2-1.3 4.5-1.3 4.5h10.9s-1.2-1.3-1.2-4.5A4.2 4.2 0 0 0 9 2.8Z" />
      <path d="M7.4 14.8a1.6 1.6 0 0 0 3.2 0" />
    </svg>
  );
}

export function IconCenter({ size = GRAPH_ICON_SIZE, className }: SvgIconProps = {}) {
  return (
    <svg {...strokeSvg(size)} className={className}>
      <circle cx="9" cy="9" r="2.2" />
      <path d="M9 2.5v2.5M9 13v2.5M2.5 9h2.5M13 9h2.5" />
      <circle cx="9" cy="9" r="5.5" />
    </svg>
  );
}

/** Enter fullscreen (corners expand outward). */
export function IconFullscreen({ size = GRAPH_ICON_SIZE, className }: SvgIconProps = {}) {
  return (
    <svg {...strokeSvg(size)} className={className}>
      <path d="M3 6.5V3h3.5M15 6.5V3h-3.5M3 11.5V15h3.5M15 11.5V15h-3.5" />
    </svg>
  );
}

/** Release notes — brown book with gold corners and a question mark on the cover. */
export function IconChangelog({ size = GRAPH_ICON_SIZE, className }: SvgIconProps = {}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      className={className}
      aria-hidden
      focusable={false}
    >
      <rect x="12.6" y="3.2" width="1.6" height="11.8" rx="0.35" fill="#E8D5B5" />
      <rect x="2.8" y="2.8" width="1.5" height="12.6" rx="0.35" fill="#4A2F18" />
      <rect x="4.1" y="2.8" width="8.8" height="12.6" rx="0.55" fill="#7A4E2A" />
      <path d="M4.1 2.8h1.75v0.7H4.75v1.1H4.1V2.8Z" fill="#D4AF37" />
      <path d="M12.9 2.8v1.75h-0.7v-1.1h-1.05V2.8h1.75Z" fill="#D4AF37" />
      <path d="M4.1 15.4v-1.75h0.7v1.1h1.05v0.65H4.1Z" fill="#D4AF37" />
      <path d="M12.9 15.4h-1.75v-0.7h1.05v-1.1h0.7v1.8Z" fill="#D4AF37" />
      <path
        d="M8.6 6.1c0-1.05 1.65-1.05 1.65 0 0 0.75-1.05 1.05-1.2 1.85v0.55"
        stroke="#FFF8E7"
        strokeWidth="1.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8.95" cy="11.35" r="0.78" fill="#FFF8E7" />
    </svg>
  );
}

/** Exit fullscreen (corners contract inward). */
export function IconFullscreenExit({ size = GRAPH_ICON_SIZE, className }: SvgIconProps = {}) {
  return (
    <svg {...strokeSvg(size)} className={className}>
      <path d="M6.5 3V6.5H3M11.5 3V6.5H15M6.5 15V11.5H3M11.5 15V11.5H15" />
    </svg>
  );
}

/** Warning triangle with exclamation (problem regions mode). */
export function IconWarning({ size = GRAPH_ICON_SIZE, className }: SvgIconProps = {}) {
  return (
    <svg {...strokeSvg(size)} className={className}>
      <path d="M9 2.8 15.4 14.5H2.6L9 2.8Z" />
      <path d="M9 7v3.2" />
      <circle cx="9" cy="12.4" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Restore auto-collapse by children threshold. */
export function IconExpandThreshold({ size = GRAPH_ICON_SIZE, className }: SvgIconProps = {}) {
  return (
    <svg {...strokeSvg(size)} className={className}>
      <path d="M3 5h12M3 9h8M3 13h5" />
      <path d="M12.5 11.5 15 14l-2.5 2.5" />
    </svg>
  );
}

/** Clear special scheme highlight (flag conflict / branch / etc.). */
export function IconClearHighlight({ size = GRAPH_ICON_SIZE, className }: SvgIconProps = {}) {
  return (
    <svg {...strokeSvg(size)} className={className}>
      <circle cx="9" cy="9" r="5.5" />
      <path d="M5.5 5.5 12.5 12.5M12.5 5.5 5.5 12.5" />
    </svg>
  );
}

/** Edge display filter (which relation types are shown). */
export function IconEdgeFilter({ size = GRAPH_ICON_SIZE, className }: SvgIconProps = {}) {
  return (
    <svg {...strokeSvg(size)} className={className}>
      <path d="M3 5h12M3 9h9M3 13h6" />
      <path d="M14 7.5 11 10.5 14 13.5" />
    </svg>
  );
}

/** Flag (for flag-tree viewer on the scheme). */
export function IconFlag({ size = GRAPH_ICON_SIZE, className }: SvgIconProps = {}) {
  return (
    <svg {...strokeSvg(size)} className={className}>
      <path d="M4.5 15.5V3.5" />
      <path d="M4.5 3.5h8.2l-1.6 2.8 1.6 2.8H4.5" />
    </svg>
  );
}

/** Flag-highlight display options (inheritance / conflicts). */
export function IconFlagHighlightOpts({ size = GRAPH_ICON_SIZE, className }: SvgIconProps = {}) {
  return (
    <svg {...strokeSvg(size)} className={className}>
      <path d="M4.5 15.5V3.5" />
      <path d="M4.5 3.5h8.2l-1.6 2.8 1.6 2.8H4.5" />
      <circle cx="13.5" cy="13.5" r="3.2" />
      <path d="M12.2 13.5h2.6M13.5 12.2v2.6" />
    </svg>
  );
}

/** Re-align / re-layout — Word-style left-align (ragged horizontal bars). */
export function IconAlign({ size = GRAPH_ICON_SIZE, className }: SvgIconProps = {}) {
  return (
    <svg {...strokeSvg(size)} className={className}>
      <path d="M3 4.5h12" />
      <path d="M3 7.5h7" />
      <path d="M3 10.5h10" />
      <path d="M3 13.5h5" />
    </svg>
  );
}

/** Circular arrows — refresh notifications. */
export function IconRefresh({ size = GRAPH_ICON_SIZE, className }: SvgIconProps = {}) {
  return (
    <svg {...strokeSvg(size)} className={className}>
      <path d="M14.5 9A5.5 5.5 0 1 1 12.5 4.2" />
      <path d="M9.5 5.5h3V2.5" />
    </svg>
  );
}
