import { useI18n } from '../i18n/I18nContext';
import type { MetricsData } from '../types';

interface MetricsPanelProps {
  metrics: MetricsData | null;
  onClose: () => void;
}

export function MetricsPanel({ metrics, onClose }: MetricsPanelProps) {
  const { t } = useI18n();

  if (!metrics) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal metrics-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('metrics.title')}</h2>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="modal-body">
          <h3>{t('metrics.count')}</h3>
          <p>{t('metrics.total')}: <strong>{metrics.total}</strong></p>
          <ul>
            {Object.entries(metrics.by_type).map(([typeName, n]) => (
              <li key={typeName}>{typeName}: {n}</li>
            ))}
          </ul>

          <h3>{t('metrics.volume')}</h3>
          <ol className="metrics-list">
            {metrics.by_volume.slice(0, 20).map((item) => (
              <li key={item.id}>
                {item.id} — {item.volume ?? 'N/A'}
              </li>
            ))}
          </ol>

          <h3>{t('metrics.points')}</h3>
          <ol className="metrics-list">
            {metrics.by_points.slice(0, 20).map((item) => (
              <li key={item.id}>{item.id} — {item.points}</li>
            ))}
          </ol>

          <h3>{t('metrics.intersections')}</h3>
          <ol className="metrics-list">
            {metrics.by_intersections.slice(0, 20).map((item) => (
              <li key={item.id}>{item.id} — {item.count}</li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
