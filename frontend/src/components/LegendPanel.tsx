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

export function LegendPanel({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();

  const schemeItems = [
    { sample: <span className="legend-node legend-node--normal" />, meaning: t('legend.normal') },
    { sample: <span className="legend-node legend-node--global" />, meaning: t('legend.global') },
    { sample: <span className="legend-node legend-node--manual" />, meaning: t('legend.manual') },
    { sample: <span className="legend-node legend-node--orphan" />, meaning: t('legend.orphan') },
    { sample: <span className="legend-node legend-node--selected" />, meaning: t('legend.selected') },
    { sample: <span className="legend-node legend-node--collapsed" />, meaning: t('legend.collapsed') },
    { sample: <LegendDirectedEdge color="#222" width={5} />, meaning: t('legend.hierarchy') },
    { sample: <span className="legend-edge legend-edge--intersects" />, meaning: t('legend.intersects') },
    { sample: <LegendDirectedEdge color="#8e44ad" width={2} />, meaning: t('legend.contains') },
  ];

  const flagItems = [
    { sample: <span className="legend-node legend-node--flag-define" />, meaning: t('legend.flagDefine') },
    { sample: <span className="legend-node legend-node--flag-path" />, meaning: t('legend.flagPath') },
    { sample: <span className="legend-node legend-node--flag-dim" />, meaning: t('legend.flagDim') },
    { sample: <span className="legend-node legend-node--flag-conflict-pair" />, meaning: t('legend.flagConflictPair') },
    { sample: <LegendDirectedEdge color="#1abc9c" width={5} />, meaning: t('legend.flagPathEdge') },
  ];

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal legend-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('legend.title')}</h2>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="modal-body">
          <ul className="legend-visual-list">
            {schemeItems.map((item, i) => (
              <li key={`s-${i}`} className="legend-visual-item">
                <div className="legend-visual-sample">{item.sample}</div>
                <p>{item.meaning}</p>
              </li>
            ))}
          </ul>
          <p className="legend-extra">{t('legend.extra')}</p>
          <h3 className="legend-section-title">{t('legend.flagTitle')}</h3>
          <ul className="legend-visual-list">
            {flagItems.map((item, i) => (
              <li key={`f-${i}`} className="legend-visual-item">
                <div className="legend-visual-sample">{item.sample}</div>
                <p>{item.meaning}</p>
              </li>
            ))}
          </ul>
          <p className="legend-extra">{t('legend.flagExtra')}</p>
        </div>
      </div>
    </ModalOverlay>
  );
}
