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

type LegendTab = 'scheme' | 'flag';

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
      sample: <LegendNode variant="flag-dim" title="other" />,
      meaning: t('legend.flagDim'),
    },
    {
      sample: <LegendNode variant="flag-conflict-pair" title="clash" subtitle="◆ allow" />,
      meaning: t('legend.flagConflictPair'),
    },
    { sample: <LegendDirectedEdge color="#1abc9c" width={5} />, meaning: t('legend.flagPathEdge') },
    { sample: <LegendDirectedEdge color="#e74c3c" width={3.5} />, meaning: t('legend.flagConflictEdge') },
    { sample: <LegendDirectedEdge color="#a855f7" width={3} />, meaning: t('legend.flagContainEdge') },
    { sample: <LegendPlainEdge color="#c2410c" width={3} />, meaning: t('legend.flagIntersectEdge') },
    { sample: <LegendPlainEdge color="#ead9c8" width={1.5} dashed />, meaning: t('legend.flagDimIntersectEdge') },
    { sample: <LegendPlainEdge color="#ddd0e6" width={1.5} />, meaning: t('legend.flagDimContainEdge') },
  ];

  const items = tab === 'scheme' ? schemeItems : flagItems;
  const extra = tab === 'scheme' ? t('legend.extra') : t('legend.flagExtra');

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal legend-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('legend.title')}</h2>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="modal-body">
          <div className="legend-tabs" role="tablist" aria-label={t('legend.title')}>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'scheme'}
              className={tab === 'scheme' ? 'active' : undefined}
              onClick={() => setTab('scheme')}
            >
              {t('legend.tabScheme')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'flag'}
              className={tab === 'flag' ? 'active' : undefined}
              onClick={() => setTab('flag')}
            >
              {t('legend.tabFlagScheme')}
            </button>
          </div>
          <ul className="legend-visual-list" role="tabpanel">
            {items.map((item, i) => (
              <li key={`${tab}-${i}`} className="legend-visual-item">
                <div className="legend-visual-sample">{item.sample}</div>
                <p>{item.meaning}</p>
              </li>
            ))}
          </ul>
          <p className="legend-extra">{extra}</p>
        </div>
      </div>
    </ModalOverlay>
  );
}
