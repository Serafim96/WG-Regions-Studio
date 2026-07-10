import { useState } from 'react';
import type { FlagInfo, RegionData } from '../types';

interface RegionPanelProps {
  region: RegionData | null;
  flagsCatalog: FlagInfo[];
  onClose: () => void;
}

export function RegionPanel({ region, flagsCatalog, onClose }: RegionPanelProps) {
  const [showFlags, setShowFlags] = useState(false);

  if (!region) return null;

  const copyName = () => {
    navigator.clipboard.writeText(region.id);
  };

  const flagEntries = Object.entries(region.flags ?? {});

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{region.id}</h2>
          <button type="button" onClick={onClose}>×</button>
        </header>

        <div className="modal-body">
          <p><strong>Тип:</strong> {region.type}</p>
          <p><strong>Родитель:</strong> {region.parent ?? '—'}</p>
          <p><strong>Приоритет:</strong> {region.priority}</p>
          {region.is_manual && <p className="badge-manual">Временный регион (без координат)</p>}

          {region.min && region.max && (
            <p>
              <strong>Координаты:</strong> min ({region.min.x}, {region.min.y}, {region.min.z}) —
              max ({region.max.x}, {region.max.y}, {region.max.z})
            </p>
          )}
          {region.points && (
            <p><strong>Точек poly2d:</strong> {region.points.length}, Y: {region.min_y}–{region.max_y}</p>
          )}

          <p><strong>Owners:</strong> {JSON.stringify(region.owners)}</p>
          <p><strong>Members:</strong> {JSON.stringify(region.members)}</p>

          <div className="modal-actions">
            <button type="button" onClick={copyName}>Копировать имя</button>
            <button type="button" onClick={() => setShowFlags(!showFlags)}>
              {showFlags ? 'Скрыть флаги' : 'Флаги'}
            </button>
          </div>

          {showFlags && (
            <div className="flags-table-wrap">
              {flagEntries.length === 0 ? (
                <p>Флаги не заданы</p>
              ) : (
                <table className="flags-table">
                  <thead>
                    <tr>
                      <th>Имя</th>
                      <th>Значение</th>
                      <th>Тип (справочник)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flagEntries.map(([name, value]) => {
                      const info = flagsCatalog.find((f) => f.name === name);
                      return (
                        <tr key={name}>
                          <td>{name}</td>
                          <td>{JSON.stringify(value)}</td>
                          <td>{info?.type ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
