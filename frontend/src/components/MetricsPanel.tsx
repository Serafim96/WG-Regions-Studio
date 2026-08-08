import { useI18n } from '../i18n/I18nContext';
import type { MetricsData } from '../types';
import { ModalOverlay } from './ModalOverlay';

interface MetricsPanelProps {
  metrics: MetricsData | null;
  onClose: () => void;
  onSelectRegion?: (regionId: string) => void;
}

function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US');
}

function RegionCell({
  id,
  onSelect,
}: {
  id: string;
  onSelect?: (regionId: string) => void;
}) {
  if (!onSelect) {
    return <span className="metrics-id">{id}</span>;
  }
  return (
    <button type="button" className="region-link metrics-id-link" onClick={() => onSelect(id)}>
      {id}
    </button>
  );
}

export function MetricsPanel({ metrics, onClose, onSelectRegion }: MetricsPanelProps) {
  const { t } = useI18n();

  if (!metrics) return null;

  const typeEntries = Object.entries(metrics.by_type);

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal metrics-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('metrics.title')}</h2>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="modal-body">
          <section className="metrics-summary">
            <h3>{t('metrics.count')}</h3>
            <table className="metrics-table metrics-table--summary">
              <thead>
                <tr>
                  <th scope="col">{t('metrics.colType')}</th>
                  <th scope="col" className="metrics-num">{t('metrics.colCount')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{t('metrics.total')}</td>
                  <td className="metrics-num">{formatNumber(metrics.total)}</td>
                </tr>
                {typeEntries.map(([typeName, n]) => (
                  <tr key={typeName}>
                    <td>{typeName}</td>
                    <td className="metrics-num">{formatNumber(n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="metrics-columns">
            <section className="metrics-block">
              <h3>{t('metrics.volume')}</h3>
              <div className="metrics-table-wrap">
                <table className="metrics-table">
                  <thead>
                    <tr>
                      <th scope="col" className="metrics-rank">#</th>
                      <th scope="col">{t('metrics.colRegion')}</th>
                      <th scope="col" className="metrics-num">{t('metrics.colVolume')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.by_volume.slice(0, 20).map((item, index) => (
                      <tr key={item.id}>
                        <td className="metrics-rank">{index + 1}</td>
                        <td className="metrics-id">
                          <RegionCell id={item.id} onSelect={onSelectRegion} />
                        </td>
                        <td className="metrics-num">{formatNumber(item.volume)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="metrics-block">
              <h3>{t('metrics.points')}</h3>
              <div className="metrics-table-wrap">
                <table className="metrics-table">
                  <thead>
                    <tr>
                      <th scope="col" className="metrics-rank">#</th>
                      <th scope="col">{t('metrics.colRegion')}</th>
                      <th scope="col" className="metrics-num">{t('metrics.colPoints')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.by_points.slice(0, 20).map((item, index) => (
                      <tr key={item.id}>
                        <td className="metrics-rank">{index + 1}</td>
                        <td className="metrics-id">
                          <RegionCell id={item.id} onSelect={onSelectRegion} />
                        </td>
                        <td className="metrics-num">{formatNumber(item.points)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="metrics-block">
              <h3>{t('metrics.intersections')}</h3>
              <div className="metrics-table-wrap">
                <table className="metrics-table">
                  <thead>
                    <tr>
                      <th scope="col" className="metrics-rank">#</th>
                      <th scope="col">{t('metrics.colRegion')}</th>
                      <th scope="col" className="metrics-num">{t('metrics.colCount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.by_intersections.slice(0, 20).map((item, index) => (
                      <tr key={item.id}>
                        <td className="metrics-rank">{index + 1}</td>
                        <td className="metrics-id">
                          <RegionCell id={item.id} onSelect={onSelectRegion} />
                        </td>
                        <td className="metrics-num">{formatNumber(item.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
