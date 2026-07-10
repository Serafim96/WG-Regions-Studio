import type { MetricsData } from '../types';

interface MetricsPanelProps {
  metrics: MetricsData | null;
  onClose: () => void;
}

export function MetricsPanel({ metrics, onClose }: MetricsPanelProps) {
  if (!metrics) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal metrics-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Метрики</h2>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="modal-body">
          <h3>6.1 — Количество регионов</h3>
          <p>Всего: <strong>{metrics.total}</strong></p>
          <ul>
            {Object.entries(metrics.by_type).map(([t, n]) => (
              <li key={t}>{t}: {n}</li>
            ))}
          </ul>

          <h3>6.2.1 — Топ по объёму блоков</h3>
          <ol className="metrics-list">
            {metrics.by_volume.slice(0, 20).map((item) => (
              <li key={item.id}>
                {item.id} — {item.volume ?? 'N/A'}
              </li>
            ))}
          </ol>

          <h3>6.2.2 — Топ по числу точек (poly2d)</h3>
          <ol className="metrics-list">
            {metrics.by_points.slice(0, 20).map((item) => (
              <li key={item.id}>{item.id} — {item.points}</li>
            ))}
          </ol>

          <h3>6.2.3 — Топ по пересечениям</h3>
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
