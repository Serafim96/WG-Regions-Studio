interface LegendPanelProps {
  onClose: () => void;
}

const ITEMS = [
  { symbol: 'Овал (цветной)', meaning: 'Обычный регион (cuboid / poly2d). Цвет зависит от глубины вложенности.' },
  { symbol: 'Облако', meaning: 'Глобальный регион (global) или временный черновик (manual) без координат.' },
  { symbol: 'Пунктирная рамка', meaning: 'Временный регион, добавленный вручную в сессии.' },
  { symbol: 'Синяя жирная рамка', meaning: 'Выбранный регион (одиночный клик) — для сворачивания и операций.' },
  { symbol: 'Сплошная стрелка ─▶', meaning: 'Иерархия: родитель → ребёнок (parent).' },
  { symbol: 'Пунктир оранжевый', meaning: 'Частичное пересечение объёмов (intersects).' },
  { symbol: 'Фиолетовая стрелка', meaning: 'Полное вхождение одного региона в другой (contains).' },
  { symbol: 'Подпись p:N d:M', meaning: 'p — приоритет региона, d — глубина в дереве (корень = 0).' },
  { symbol: 'Одиночный клик', meaning: 'Выделить регион для сворачивания / разворачивания.' },
  { symbol: 'Двойной клик', meaning: 'Открыть карточку региона с параметрами и флагами.' },
  { symbol: 'ПКМ по узлу', meaning: 'Копировать имя, скрыть или показать детей.' },
];

export function LegendPanel({ onClose }: LegendPanelProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal legend-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Легенда</h2>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="modal-body">
          <table className="legend-table">
            <thead>
              <tr>
                <th>Обозначение</th>
                <th>Значение</th>
              </tr>
            </thead>
            <tbody>
              {ITEMS.map((item) => (
                <tr key={item.symbol}>
                  <td>{item.symbol}</td>
                  <td>{item.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
