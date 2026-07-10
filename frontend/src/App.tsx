import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addManualRegion,
  buildScheme,
  fetchFlags,
  loadScheme,
  parseYaml,
  saveScheme,
} from './api';
import { AddRegionDialog } from './components/AddRegionDialog';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GraphView } from './components/GraphView';
import { LegendPanel } from './components/LegendPanel';
import { MetricsPanel } from './components/MetricsPanel';
import { RegionPanel } from './components/RegionPanel';
import type { FlagInfo, ForestNode, RegionData, Scheme } from './types';
import { collectDescendants } from './utils/graph';
import { computeDefaultHiddenNodes } from './utils/layout';
import { loadAppSettings, saveAppSettings } from './utils/settings';
import { loadViewState, saveViewState } from './utils/viewState';

function findForestNode(scheme: Scheme, id: string): ForestNode | null {
  function search(nodes: ForestNode[]): ForestNode | null {
    for (const n of nodes) {
      if (n.id === id) return n;
      const found = search(n.children);
      if (found) return found;
    }
    return null;
  }
  return search(scheme.forest.roots);
}

export default function App() {
  const initialSettings = loadAppSettings();
  const [scheme, setScheme] = useState<Scheme | null>(null);
  const [status, setStatus] = useState('Загрузите regions.yml');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [hiddenNodes, setHiddenNodes] = useState<Set<string>>(new Set());
  const [flagsCatalog, setFlagsCatalog] = useState<FlagInfo[]>([]);
  const [showMetrics, setShowMetrics] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [collapseThreshold, setCollapseThreshold] = useState(initialSettings.collapseThreshold);
  const [depthScale, setDepthScale] = useState(initialSettings.depthScale);
  const [appliedDepthScale, setAppliedDepthScale] = useState(initialSettings.depthScale);
  const [baseSize] = useState(60);
  const [collapseTarget, setCollapseTarget] = useState<string | null>(null);
  const [loadedYamlHash, setLoadedYamlHash] = useState<string | null>(null);
  const [hashWarning, setHashWarning] = useState<string | null>(null);
  const schemeKeyRef = useRef('default');
  const isFreshSchemeRef = useRef(false);

  useEffect(() => {
    fetchFlags().then(setFlagsCatalog);
  }, []);

  useEffect(() => {
    saveAppSettings({ collapseThreshold, depthScale });
  }, [collapseThreshold, depthScale]);

  useEffect(() => {
    if (!scheme) return;
    const key = scheme.sourceHash || 'default';
    schemeKeyRef.current = key;
    const saved = loadViewState(key);
    if (isFreshSchemeRef.current) {
      isFreshSchemeRef.current = false;
    } else if (saved) {
      setHiddenNodes(new Set(saved.hiddenNodes));
      setAppliedDepthScale(saved.depthScale);
      setCollapseTarget(saved.collapseTarget);
    }
  }, [scheme?.sourceHash]);

  useEffect(() => {
    if (!scheme) return;
    saveViewState(schemeKeyRef.current, {
      hiddenNodes: Array.from(hiddenNodes),
      depthScale: appliedDepthScale,
      collapseTarget,
    });
  }, [scheme, hiddenNodes, appliedDepthScale, collapseTarget]);

  const detailsRegion: RegionData | null = useMemo(() => {
    if (!scheme || !detailsId) return null;
    return scheme.regions.find((r) => r.id === detailsId) ?? null;
  }, [scheme, detailsId]);

  const detailsChildCount = useMemo(() => {
    if (!scheme || !detailsId) return 0;
    const node = findForestNode(scheme, detailsId);
    return node?.children.length ?? 0;
  }, [scheme, detailsId]);

  const applyScheme = useCallback((next: Scheme, fresh: boolean, threshold: number) => {
    isFreshSchemeRef.current = fresh;
    if (fresh) {
      const defaults = computeDefaultHiddenNodes(next, threshold);
      setHiddenNodes(defaults);
      setScheme(next);
      return defaults.size;
    }
    setScheme(next);
    return 0;
  }, []);

  const parentOptions = useMemo(
    () => (scheme ? scheme.regions.map((r) => r.id).sort() : []),
    [scheme],
  );

  const handleYamlUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const preview = await parseYaml(file);
      const newHash = preview.source_hash;

      if (scheme && scheme.sourceHash && scheme.sourceHash !== newHash) {
        setHashWarning(
          `Внимание: загруженный YAML отличается от схемы (hash ${scheme.sourceHash} → ${newHash}). Постройте схему заново.`,
        );
      } else {
        setHashWarning(null);
      }

      setLoadedYamlHash(newHash);
      setStatus(`Загружено ${preview.count} регионов из ${preview.source_path}`);
      setScheme(null);
      setHiddenNodes(new Set());
      setSelectedId(null);
      setDetailsId(null);
      isFreshSchemeRef.current = true;
    } catch (err) {
      setStatus(`Ошибка: ${err}`);
    }
    e.target.value = '';
  };

  const handleBuild = async () => {
    try {
      setStatus('Построение схемы…');
      const result = await buildScheme();
      const collapsed = applyScheme(result.scheme, true, collapseThreshold);
      setAppliedDepthScale(depthScale);
      setHashWarning(null);
      let msg = `Схема готова: ${result.scheme.regions.length} узлов, ${result.scheme.spatialEdges.length} spatial-рёбер`;
      if (collapsed > 0) msg += ` | Авто-свёрнуто ${collapsed} узлов (порог >${collapseThreshold})`;
      setStatus(msg);
    } catch (err) {
      setStatus(`Ошибка: ${err}`);
    }
  };

  const handleSaveScheme = async () => {
    const path = prompt('Путь для сохранения (.mrv.json):', 'scheme.mrv.json');
    if (!path) return;
    try {
      await saveScheme(path);
      setStatus(`Схема сохранена: ${path}`);
    } catch (err) {
      setStatus(`Ошибка: ${err}`);
    }
  };

  const handleLoadScheme = async () => {
    const path = prompt('Путь к схеме (.mrv.json):', 'scheme.mrv.json');
    if (!path) return;
    try {
      const loaded = await loadScheme(path);
      const collapsed = applyScheme(loaded, true, collapseThreshold);

      if (loadedYamlHash && loaded.sourceHash !== loadedYamlHash) {
        setHashWarning(
          `Внимание: схема построена из другого YAML (hash схемы ${loaded.sourceHash}, текущий YAML ${loadedYamlHash}).`,
        );
      } else {
        setHashWarning(null);
      }

      setStatus(`Схема загружена: ${loaded.regions.length} узлов${collapsed > 0 ? ` | авто-свёрнуто ${collapsed}` : ''}`);
    } catch (err) {
      setStatus(`Ошибка: ${err}`);
    }
  };

  const toggleChildren = useCallback((regionId: string, hide: boolean) => {
    if (!scheme) return;
    const node = findForestNode(scheme, regionId);
    if (!node) return;
    const childIds = node.children.map((c: ForestNode) => c.id);
    const allIds = hide
      ? node.children.flatMap((c) => [c.id, ...collectDescendants(c)])
      : childIds;
    setHiddenNodes((prev) => {
      const next = new Set(prev);
      for (const cid of allIds) {
        if (hide) next.add(cid);
        else next.delete(cid);
      }
      return next;
    });
  }, [scheme]);

  const toggleRecursive = useCallback((regionId: string, hide: boolean) => {
    if (!scheme) return;
    const node = findForestNode(scheme, regionId);
    if (!node) return;
    const ids = collectDescendants(node);
    setHiddenNodes((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (hide) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, [scheme]);

  const handleAddManual = async (data: {
    id: string;
    parent: string | null;
    priority: number;
    flags: Record<string, string>;
  }) => {
    try {
      await addManualRegion({ ...data, type: 'manual', owners: {}, members: {} });
      const result = await buildScheme();
      applyScheme(result.scheme, true, collapseThreshold);
      setShowAddDialog(false);
      setStatus(`Добавлен временный регион: ${data.id}`);
    } catch (err) {
      setStatus(`Ошибка: ${err}`);
    }
  };

  const onNodeSelect = useCallback((id: string) => {
    setSelectedId(id);
    setCollapseTarget(id);
  }, []);

  const onNodeOpen = useCallback((id: string) => {
    setSelectedId(id);
    setCollapseTarget(id);
    setDetailsId(id);
  }, []);

  const onCopyName = useCallback((id: string) => {
    navigator.clipboard.writeText(id);
    setStatus(`Скопировано: ${id}`);
  }, []);

  const onContextCollapse = useCallback((id: string, hide: boolean) => {
    setCollapseTarget(id);
    setSelectedId(id);
    toggleChildren(id, hide);
  }, [toggleChildren]);

  const blockBrowserMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <div className="app">
      <aside className="toolbar">
        <h1>Regions Viewer</h1>
        <label className="file-btn">
          Открыть YAML
          <input type="file" accept=".yml,.yaml" onChange={handleYamlUpload} hidden />
        </label>
        <button type="button" onClick={handleBuild}>Построить схему</button>
        <button type="button" onClick={handleSaveScheme} disabled={!scheme}>Сохранить схему</button>
        <button type="button" onClick={handleLoadScheme}>Открыть схему</button>
        <button type="button" onClick={() => setShowAddDialog(true)} disabled={!scheme}>
          + Временный регион
        </button>
        <button type="button" onClick={() => setShowMetrics(true)} disabled={!scheme}>
          Метрики
        </button>
        <button type="button" onClick={() => setShowLegend(true)}>Легенда</button>

        <div className="settings-block">
          <p className="depth-scale-title">Авто-сворачивание</p>
          <p className="depth-scale-hint">
            При построении схемы скрывать поддеревья узлов, у которых больше N прямых детей.
          </p>
          <label>
            Порог (N): {collapseThreshold}
            <input
              type="range"
              min={0}
              max={200}
              step={1}
              value={collapseThreshold}
              onChange={(e) => setCollapseThreshold(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="depth-scale">
          <p className="depth-scale-title">Размер кружков по уровню вложенности</p>
          <p className="depth-scale-hint">
            Коэффициент уменьшения узла и текста на каждом уровне глубины.
            Применяется кнопкой «Применить» или при построении схемы.
          </p>
          <label>
            Коэффициент: {depthScale.toFixed(2)}
            <input
              type="range"
              min={0.5}
              max={1}
              step={0.05}
              value={depthScale}
              onChange={(e) => setDepthScale(Number(e.target.value))}
            />
          </label>
          <button type="button" onClick={() => setAppliedDepthScale(depthScale)}>Применить</button>
        </div>

        {hashWarning && <p className="hash-warning">{hashWarning}</p>}

        {collapseTarget && scheme && (
          <div className="collapse-panel">
            <p>Выбран: <strong>{collapseTarget}</strong></p>
            <button type="button" onClick={() => toggleChildren(collapseTarget, true)}>− Скрыть детей</button>
            <button type="button" onClick={() => toggleChildren(collapseTarget, false)}>+ Показать детей</button>
            <button type="button" onClick={() => toggleRecursive(collapseTarget, true)}>Свернуть рекурсивно</button>
            <button type="button" onClick={() => toggleRecursive(collapseTarget, false)}>Развернуть рекурсивно</button>
          </div>
        )}

        <p className="status">{status}</p>
        <p className="hint">Клик — выбор, двойной клик — карточка, ПКМ — меню</p>
      </aside>

      <main className="graph-area" onContextMenu={blockBrowserMenu}>
        {scheme ? (
          <ErrorBoundary>
            <GraphView
              scheme={scheme}
              hiddenNodes={hiddenNodes}
              selectedId={selectedId}
              depthScale={appliedDepthScale}
              baseSize={baseSize}
              onNodeSelect={onNodeSelect}
              onNodeOpen={onNodeOpen}
              onCopyName={onCopyName}
              onCollapseChildren={(id) => onContextCollapse(id, true)}
              onExpandChildren={(id) => onContextCollapse(id, false)}
            />
          </ErrorBoundary>
        ) : (
          <div className="placeholder">Загрузите YAML и нажмите «Построить схему»</div>
        )}
      </main>

      {detailsRegion && (
        <RegionPanel
          region={detailsRegion}
          childCount={detailsChildCount}
          flagsCatalog={flagsCatalog}
          onClose={() => setDetailsId(null)}
        />
      )}
      {showMetrics && scheme && (
        <MetricsPanel metrics={scheme.metrics} onClose={() => setShowMetrics(false)} />
      )}
      {showLegend && <LegendPanel onClose={() => setShowLegend(false)} />}
      {showAddDialog && (
        <AddRegionDialog
          parentOptions={parentOptions}
          onAdd={handleAddManual}
          onClose={() => setShowAddDialog(false)}
        />
      )}
    </div>
  );
}
