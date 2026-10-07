import { useState, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { ModalOverlay } from './ModalOverlay';

function LegendDirectedEdge({ color, width = 2.5 }: { color: string; width?: number }) {
  return (
    <svg width="56" height="20" viewBox="0 0 56 20" className="legend-arrow-svg" aria-hidden>
      <line x1="4" y1="10" x2="42" y2="10" stroke={color} strokeWidth={width} />
      <polygon points="42,5 52,10 42,15" fill={color} />
    </svg>
  );
}

function LegendEdgeCaption({
  center,
  source,
  target,
  variant,
}: {
  center: string;
  source?: string;
  target?: string;
  variant?: 'hierarchy' | 'contain' | 'warning' | 'undefined';
}) {
  const variantClass =
    variant === 'hierarchy'
      ? ' legend-edge-caption-sample--hierarchy'
      : variant === 'contain'
        ? ' legend-edge-caption-sample--contain'
        : variant === 'warning'
          ? ' legend-edge-caption-sample--warning'
          : variant === 'undefined'
            ? ' legend-edge-caption-sample--undefined'
            : '';
  return (
    <span className={`legend-edge-caption-sample${variantClass}`} aria-hidden>
      {source ? <span className="legend-edge-caption-end">{source}</span> : null}
      <span className="legend-edge-caption-center">{center}</span>
      {target ? <span className="legend-edge-caption-end">{target}</span> : null}
    </span>
  );
}

function LegendPlainEdge({
  color,
  width = 2.5,
  dashed = false,
}: {
  color: string;
  width?: number;
  dashed?: boolean;
}) {
  return (
    <svg width="56" height="20" viewBox="0 0 56 20" className="legend-arrow-svg" aria-hidden>
      <line
        x1="6"
        y1="10"
        x2="50"
        y2="10"
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dashed ? '5 4' : undefined}
      />
    </svg>
  );
}

/** Edge label on a line (as on the flag scheme), not beside it. */
function LegendEdgeCaptionOnLine({
  lineColor,
  lineWidth = 3,
  center,
  variant,
}: {
  lineColor: string;
  lineWidth?: number;
  center: string;
  variant: 'undefined';
}) {
  return (
    <span className="legend-edge-caption-on-line" aria-hidden>
      <svg width="120" height="24" viewBox="0 0 120 24" className="legend-arrow-svg">
        <line x1="4" y1="12" x2="116" y2="12" stroke={lineColor} strokeWidth={lineWidth} />
      </svg>
      <LegendEdgeCaption center={center} variant={variant} />
    </span>
  );
}

function LegendNode({
  variant,
  title,
  subtitle,
}: {
  variant: string;
  title: string;
  subtitle?: string;
}) {
  const subLines = subtitle ? subtitle.split('\n').filter(Boolean) : [];
  return (
    <span className={`legend-node legend-node--labeled legend-node--${variant}`}>
      <span className="legend-node-text">
        <span className="legend-node-title">{title}</span>
        {subLines.map((line) => (
          <span key={line} className="legend-node-sub">{line}</span>
        ))}
      </span>
    </span>
  );
}

type LegendTab = 'scheme' | 'flag' | 'keys';

function LegendKbdCombo({ keys }: { keys: string[] }) {
  return (
    <span className="legend-keys-combo">
      {keys.map((key, i) => (
        <span key={`${key}-${i}`} className="legend-keys-part">
          {i > 0 && <span className="legend-keys-plus">+</span>}
          <kbd>{key}</kbd>
        </span>
      ))}
    </span>
  );
}

function LegendShortcutRow({
  combos,
  meaning,
}: {
  combos: string[][];
  meaning: string;
}) {
  return (
    <li className="legend-keys-item">
      <div className="legend-keys-sample">
        {combos.map((keys, i) => (
          <span key={keys.join('+')} className="legend-keys-alt">
            {i > 0 && <span className="legend-keys-or">/</span>}
            <LegendKbdCombo keys={keys} />
          </span>
        ))}
      </div>
      <p>{meaning}</p>
    </li>
  );
}

export function LegendPanel({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<LegendTab>('scheme');

  const schemeItems: { sample: ReactNode; meaning: string }[] = [
    {
      sample: <LegendNode variant="normal" title="spawn" subtitle="p:0 d:1" />,
      meaning: t('legend.normal'),
    },
    {
      sample: <LegendNode variant="global" title="__global__" />,
      meaning: t('legend.global'),
    },
    {
      sample: <LegendNode variant="manual" title="draft" subtitle="p:0 d:0" />,
      meaning: t('legend.manual'),
    },
    {
      sample: <LegendNode variant="orphan" title="lost" subtitle="p:0 d:0" />,
      meaning: t('legend.orphan'),
    },
    {
      sample: <LegendNode variant="selected" title="spawn" subtitle="p:0 d:1" />,
      meaning: t('legend.selected'),
    },
    {
      sample: (
        <LegendNode
          variant="collapsed"
          title="base"
          subtitle={`p:0 d:0\n${t('graph.hiddenCount', { count: 3 })}`}
        />
      ),
      meaning: t('legend.collapsed'),
    },
    { sample: <LegendDirectedEdge color="#222" width={5} />, meaning: t('legend.hierarchy') },
    { sample: <LegendPlainEdge color="#e67e22" width={1.5} dashed />, meaning: t('legend.intersects') },
    { sample: <LegendDirectedEdge color="#8e44ad" width={2} />, meaning: t('legend.contains') },
  ];

  const flagItems: { sample: ReactNode; meaning: string }[] = [
    {
      sample: <LegendNode variant="flag-define" title="home" subtitle="◆ allow" />,
      meaning: t('legend.flagDefine'),
    },
    {
      sample: <LegendNode variant="flag-path" title="child" subtitle="◇ allow" />,
      meaning: t('legend.flagPath'),
    },
    {
      sample: <LegendNode variant="flag-contained-no-inherit" title="pocket" subtitle="∈ allow" />,
      meaning: t('legend.flagContainedNoInherit'),
    },
    {
      sample: <LegendNode variant="flag-intersect-partial" title="near" subtitle="≈ deny" />,
      meaning: t('legend.flagIntersectPartial'),
    },
    {
      sample: <LegendNode variant="flag-path" title="mix" subtitle="◇ 12% allow" />,
      meaning: t('legend.flagPartialNode'),
    },
    {
      sample: <LegendNode variant="flag-conflict-warning" title="warn" subtitle="◆ deny" />,
      meaning: t('legend.flagConflictWarning'),
    },
    {
      sample: <LegendNode variant="flag-dim" title="other" />,
      meaning: t('legend.flagDim'),
    },
    {
      sample: <LegendNode variant="flag-conflict-pair" title="clash" subtitle="◆ allow" />,
      meaning: t('legend.flagConflictPair'),
    },
    { sample: <LegendDirectedEdge color="#1abc9c" width={5} />, meaning: t('legend.flagPathEdge') },
    { sample: <LegendDirectedEdge color="#ef4444" width={6} />, meaning: t('legend.flagConflictEdge') },
    {
      sample: <LegendPlainEdge color="#c9a227" width={3} dashed />,
      meaning: t('legend.flagWarningEdge'),
    },
    { sample: <LegendDirectedEdge color="#a855f7" width={3} />, meaning: t('legend.flagContainEdge') },
    { sample: <LegendPlainEdge color="#f97316" width={3} />, meaning: t('legend.flagIntersectEdge') },
    {
      sample: <LegendEdgeCaption center="allow" source="(1%)" target="(28%)" />,
      meaning: t('legend.flagEdgePercents'),
    },
    {
      sample: <LegendEdgeCaption center="deny" variant="warning" />,
      meaning: t('legend.flagWarningEdgeLabel'),
    },
    {
      sample: (
        <LegendEdgeCaptionOnLine lineColor="#ef4444" lineWidth={3} center="greeting" variant="undefined" />
      ),
      meaning: t('legend.flagUndefinedEdgeLabel'),
    },
    {
      sample: <LegendEdgeCaption center="hello→" variant="hierarchy" />,
      meaning: t('legend.flagEdgeValueFlow'),
    },
    {
      sample: <LegendEdgeCaption center="←hello" variant="contain" />,
      meaning: t('legend.flagEdgeValueFlow'),
    },
    {
      sample: <LegendEdgeCaption center="bye→⮾" variant="contain" />,
      meaning: t('legend.flagEdgeValueBlocked'),
    },
    { sample: <LegendDirectedEdge color="#a855f7" width={3} />, meaning: t('legend.flagContainArrow') },
    { sample: <LegendPlainEdge color="#ead9c8" width={1.5} dashed />, meaning: t('legend.flagDimIntersectEdge') },
    { sample: <LegendPlainEdge color="#ddd0e6" width={1.5} />, meaning: t('legend.flagDimContainEdge') },
  ];

  const items = tab === 'scheme' ? schemeItems : flagItems;
  const extra = tab === 'scheme' ? t('legend.extra') : t('legend.flagExtra');

  const keyboardRows: { combos: string[][]; meaning: string }[] = [
    { combos: [['Ctrl', 'F']], meaning: t('legend.keys.search') },
    { combos: [['Ctrl', 'Z']], meaning: t('legend.keys.undo') },
    { combos: [['Ctrl', 'Y'], ['Ctrl', 'Shift', 'Z']], meaning: t('legend.keys.redo') },
    { combos: [['F']], meaning: t('legend.keys.fullscreen') },
    { combos: [['Esc']], meaning: t('legend.keys.closeSearch') },
    { combos: [['Enter']], meaning: t('legend.keys.searchEnter') },
  ];

  const mouseRows: { gesture: string; meaning: string }[] = [
    { gesture: t('legend.keys.click'), meaning: t('legend.keys.clickMeaning') },
    { gesture: t('legend.keys.dblclick'), meaning: t('legend.keys.dblclickMeaning') },
    { gesture: t('legend.keys.rmbNode'), meaning: t('legend.keys.rmbNodeMeaning') },
    { gesture: t('legend.keys.rmbEmpty'), meaning: t('legend.keys.rmbEmptyMeaning') },
    { gesture: t('legend.keys.clickEmpty'), meaning: t('legend.keys.clickEmptyMeaning') },
    { gesture: t('legend.keys.wheel'), meaning: t('legend.keys.wheelMeaning') },
    { gesture: t('legend.keys.drag'), meaning: t('legend.keys.dragMeaning') },
  ];

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal legend-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('legend.title')}</h2>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="modal-body">
          <div className="notifications-tabs" role="tablist" aria-label={t('legend.title')}>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'scheme'}
              className={`notifications-tab${tab === 'scheme' ? ' active' : ''}`}
              onClick={() => setTab('scheme')}
            >
              {t('legend.tabScheme')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'flag'}
              className={`notifications-tab${tab === 'flag' ? ' active' : ''}`}
              onClick={() => setTab('flag')}
            >
              {t('legend.tabFlagScheme')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'keys'}
              className={`notifications-tab${tab === 'keys' ? ' active' : ''}`}
              onClick={() => setTab('keys')}
            >
              {t('legend.tabKeys')}
            </button>
          </div>
          {tab === 'keys' ? (
            <div role="tabpanel">
              <h3 className="legend-keys-section">{t('legend.keys.keyboard')}</h3>
              <ul className="legend-keys-list">
                {keyboardRows.map((row) => (
                  <LegendShortcutRow
                    key={row.combos.map((c) => c.join('+')).join('/')}
                    combos={row.combos}
                    meaning={row.meaning}
                  />
                ))}
              </ul>
              <h3 className="legend-keys-section">{t('legend.keys.mouse')}</h3>
              <ul className="legend-keys-list">
                {mouseRows.map((row) => (
                  <li key={row.gesture} className="legend-keys-item">
                    <div className="legend-keys-sample">
                      <span className="legend-keys-gesture">{row.gesture}</span>
                    </div>
                    <p>{row.meaning}</p>
                  </li>
                ))}
              </ul>
              <p className="legend-extra">{t('legend.keys.extra')}</p>
            </div>
          ) : (
            <>
              <ul className="legend-visual-list" role="tabpanel">
                {items.map((item, i) => (
                  <li key={`${tab}-${i}`} className="legend-visual-item">
                    <div className="legend-visual-sample">{item.sample}</div>
                    <p>{item.meaning}</p>
                  </li>
                ))}
              </ul>
              <p className="legend-extra">{extra}</p>
            </>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
