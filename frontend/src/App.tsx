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
import { GraphView } from './components/GraphView';
import { MetricsPanel } from './components/MetricsPanel';
import { RegionPanel } from './components/RegionPanel';
import type { FlagInfo, ForestNode, RegionData, Scheme } from './types';
import { collectDescendants } from './utils/graph';
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
  const [scheme, setScheme] = useState<Scheme | null>(null);
  const [status, setStatus] = useState('Загрузите regions.yml');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hiddenNodes, setHiddenNodes] = useState<Set<string>>(new Set());
  const [flagsCatalog, setFlagsCatalog] = useState<FlagInfo[]>([]);
  const [showMetrics, setShowMetrics] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [depthScale, setDepthScale] = useState(0.85);
  const [appliedDepthScale, setAppliedDepthScale] = useState(0.85);
  const [baseSize] = useState(60);
  const [collapseTarget, setCollapseTarget] = useState<string | null>(null);
  const [loadedYamlHash, setLoadedYamlHash] = useState<string | null>(null);
  const [hashWarning, setHashWarning] = useState<string | null>(null);
  const schemeKeyRef = useRef('default');

  useEffect(() => {
    fetchFlags().then(setFlagsCatalog);
  }, []);

  // Restore view state when scheme changes
  useEffect(() => {
    if (!scheme) return;
    const key = scheme.sourceHash || 'default';
    schemeKeyRef.current = key;
    const saved = loadViewState(key);
    if (saved) {
      setHiddenNodes(new Set(saved.hiddenNodes));
      setDepthScale(saved.depthScale);
      setAppliedDepthScale(saved.depthScale);
      setCollapseTarget(saved.collapseTarget);
    }
  }, [scheme?.sourceHash]);

  // Persist view state
  useEffect(() => {
    if (!scheme) return;
    saveViewState(schemeKeyRef.current, {
      hiddenNodes: Array.from(hiddenNodes),
      depthScale: appliedDepthScale,
      collapseTarget,
    });
  }, [scheme, hiddenNodes, appliedDepthScale, collapseTarget]);

  const selectedRegion: RegionData | null = useMemo(() => {
    if (!scheme || !selectedId) return null;
    return scheme.regions.find((r) => r.id === selectedId) ?? null;
  }, [scheme, selectedId]);

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
    } catch (err) {
      setStatus(`Ошибка: ${err}`);
    }
    e.target.value = '';
  };

  const handleBuild = async () => {
    try {
      setStatus('Построение схемы…');
      const result = await buildScheme();
      setScheme(result.scheme);
      setHiddenNodes(new Set());
      setHashWarning(null);
      setStatus(
        `Схема готова: ${result.scheme.regions.length} узлов, ${result.scheme.spatialEdges.length} spatial-рёбер`,
      );
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
      setScheme(loaded);
      setHiddenNodes(new Set());

      if (loadedYamlHash && loaded.sourceHash !== loadedYamlHash) {
        setHashWarning(
          `Внимание: схема построена из другого YAML (hash схемы ${loaded.sourceHash}, текущий YAML ${loadedYamlHash}).`,
        );
      } else {
        setHashWarning(null);
      }

      setStatus(`Схема загружена: ${loaded.regions.length} узлов`);
    } catch (err) {
      setStatus(`Ошибка: ${err}`);
    }
  };

  const toggleChildren = useCallback((regionId: string, hide: boolean) => {
    if (!scheme) return;
    const node = findForestNode(scheme, regionId);
    if (!node) return;
    const childIds = node.children.map((c: ForestNode) => c.id);
    setHiddenNodes((prev) => {
      const next = new Set(prev);
      for (const cid of childIds) {
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
      setScheme(result.scheme);
      setShowAddDialog(false);
      setStatus(`Добавлен временный регион: ${data.id}`);
    } catch (err) {
      setStatus(`Ошибка: ${err}`);
    }
  };

  const onNodeClick = useCallback((id: string) => {
    setSelectedId(id);
    setCollapseTarget(id);
  }, []);

  const onCopyName = useCallback((id: string) => {
    navigator.clipboard.writeText(id);
    setStatus(`Скопировано: ${id}`);
  }, []);

  const onContextCollapse = useCallback((id: string, hide: boolean) => {
    setCollapseTarget(id);
    toggleChildren(id, hide);
  }, [toggleChildren]);

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

        <div className="depth-scale">
          <label>
            Масштаб по глубине: {depthScale.toFixed(2)}
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
            <p>Сворачивание: <strong>{collapseTarget}</strong></p>
            <button type="button" onClick={() => toggleChildren(collapseTarget, true)}>− Скрыть детей</button>
            <button type="button" onClick={() => toggleChildren(collapseTarget, false)}>+ Показать детей</button>
            <button type="button" onClick={() => toggleRecursive(collapseTarget, true)}>Свернуть рекурсивно</button>
            <button type="button" onClick={() => toggleRecursive(collapseTarget, false)}>Развернуть рекурсивно</button>
          </div>
        )}

        <p className="status">{status}</p>
        <p className="hint">ПКМ по узлу: копировать имя, ± дети</p>
      </aside>

      <main className="graph-area">
        {scheme ? (
          <GraphView
            scheme={scheme}
            hiddenNodes={hiddenNodes}
            depthScale={appliedDepthScale}
            baseSize={baseSize}
            onNodeClick={onNodeClick}
            onCopyName={onCopyName}
            onCollapseChildren={(id) => onContextCollapse(id, true)}
            onExpandChildren={(id) => onContextCollapse(id, false)}
          />
        ) : (
          <div className="placeholder">Загрузите YAML и нажмите «Построить схему»</div>
        )}
      </main>

      {selectedRegion && (
        <RegionPanel
          region={selectedRegion}
          flagsCatalog={flagsCatalog}
          onClose={() => setSelectedId(null)}
        />
      )}
      {showMetrics && scheme && (
        <MetricsPanel metrics={scheme.metrics} onClose={() => setShowMetrics(false)} />
      )}
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
