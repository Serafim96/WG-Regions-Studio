import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { FlagInfo, ForestNode, RegionData, Scheme } from '../types';
import { buildParentMap } from '../utils/graph';
import {
  buildFlagDefinitionTree,
  defaultCollapsedWithoutFlagSubtrees,
  listUsedFlagNames,
  type FlagTreeNode,
} from '../utils/flagTree';
import { FlagHelpButton, findFlagInfo } from './FlagHelpButton';
import { FlagNameCombobox } from './FlagNameCombobox';
import { FlagValueInput } from './FlagValueInput';
import {
  IconCollapseAll,
  IconExpandAll,
  IconTreeChevron,
  SIDEBAR_ICON_SIZE,
  TREE_ICON_SIZE,
} from './GraphControlIcons';
import { SearchPanel } from './SearchPanel';

interface FlagRow {
  key: string;
  name: string;
  value: string;
}

interface FlagsManagerDialogProps {
  scheme: Scheme;
  flagsCatalog: FlagInfo[];
  onClose: () => void;
  onSave: (regionId: string, flags: Record<string, unknown>) => Promise<void>;
  onBulk: (payload: {
    flag: string;
    action: 'delete' | 'update';
    value?: unknown;
    regionIds: string[] | null;
  }) => Promise<{ count: number }>;
  /** Highlight flag assignment tree on the main scheme. */
  highlightFlag: string | null;
  onHighlightFlag: (flagName: string | null) => void;
  onOpenCatalog: () => void;
  /** Open focused on this region (pinned with parents, ready to edit). */
  initialRegionId?: string | null;
}

function regionHasFlags(region: RegionData | undefined): boolean {
  return !!region && Object.keys(region.flags).length > 0;
}

/** Keep nodes with flags, explicitly pinned ids, and their ancestors. */
function filterForestWithFlags(
  nodes: ForestNode[],
  regionsById: Map<string, RegionData>,
  pinnedIds: Set<string>,
): ForestNode[] {
  const result: ForestNode[] = [];
  for (const node of nodes) {
    const children = filterForestWithFlags(node.children, regionsById, pinnedIds);
    const selfHas = regionHasFlags(regionsById.get(node.id)) || pinnedIds.has(node.id);
    if (selfHas || children.length > 0) {
      result.push({ ...node, children });
    }
  }
  return result;
}

function collectAncestorIds(
  regionId: string,
  parentMap: Map<string, string | null>,
): string[] {
  const ids: string[] = [];
  let current: string | null | undefined = regionId;
  while (current) {
    ids.push(current);
    current = parentMap.get(current) ?? null;
  }
  return ids;
}

function formatFlagValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function parseFlagValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}

function flagsToRows(flags: Record<string, unknown>): FlagRow[] {
  return Object.entries(flags).map(([name, value], index) => ({
    key: `${name}-${index}`,
    name,
    value: formatFlagValue(value),
  }));
}

function rowsToFlags(rows: FlagRow[]): Record<string, unknown> {
  const flags: Record<string, unknown> = {};
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) continue;
    flags[name] = parseFlagValue(row.value);
  }
  return flags;
}

function TreeNode({
  node,
  regionsById,
  selectedId,
  depth,
  collapsedIds,
  onSelect,
  onToggleCollapse,
}: {
  node: ForestNode;
  regionsById: Map<string, RegionData>;
  selectedId: string | null;
  depth: number;
  collapsedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
}) {
  const hasFlags = regionHasFlags(regionsById.get(node.id));
  const hasChildren = node.children.length > 0;
  const collapsed = collapsedIds.has(node.id);
  return (
    <li>
      <div className="flags-tree-row">
        {hasChildren ? (
          <button
            type="button"
            className="flags-tree-toggle"
            onClick={() => onToggleCollapse(node.id)}
            aria-label={collapsed ? 'expand' : 'collapse'}
          >
            {collapsed
              ? <IconTreeChevron expanded={false} size={TREE_ICON_SIZE} />
              : <IconTreeChevron expanded size={TREE_ICON_SIZE} />}
          </button>
        ) : (
          <span className="flags-tree-toggle-spacer" />
        )}
        <button
          type="button"
          className={[
            'flags-tree-item',
            selectedId === node.id ? 'selected' : '',
            hasFlags ? 'has-flags' : 'no-flags',
          ].filter(Boolean).join(' ')}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => onSelect(node.id)}
        >
          {node.id}
          {hasFlags && (
            <span className="flags-tree-count">
              {Object.keys(regionsById.get(node.id)!.flags).length}
            </span>
          )}
        </button>
      </div>
      {hasChildren && !collapsed && (
        <ul>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              regionsById={regionsById}
              selectedId={selectedId}
              depth={depth + 1}
              collapsedIds={collapsedIds}
              onSelect={onSelect}
              onToggleCollapse={onToggleCollapse}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function FlagDefTreeNode({
  node,
  depth,
  onSelect,
}: {
  node: FlagTreeNode;
  depth: number;
  onSelect: (id: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="flags-tree-item has-flags"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => onSelect(node.id)}
      >
        {node.id}
        <span className="flags-tree-count">{formatFlagValue(node.value)}</span>
      </button>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <FlagDefTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function FlagsManagerDialog({
  scheme,
  flagsCatalog,
  onClose,
  onSave,
  onBulk,
  highlightFlag,
  onHighlightFlag,
  onOpenCatalog,
  initialRegionId = null,
}: FlagsManagerDialogProps) {
  const { t } = useI18n();
  const regionsById = useMemo(
    () => new Map(scheme.regions.map((r) => [r.id, r])),
    [scheme.regions],
  );
  const parentMap = useMemo(
    () => buildParentMap(scheme.regions),
    [scheme.regions],
  );
  const allRegionIds = useMemo(
    () => scheme.regions.map((r) => r.id).sort(),
    [scheme.regions],
  );
  const usedFlags = useMemo(() => listUsedFlagNames(scheme), [scheme]);
  const flagPickOptions = useMemo(() => usedFlags, [usedFlags]);

  const initialPinned = useMemo(() => {
    if (!initialRegionId || !regionsById.has(initialRegionId)) return new Set<string>();
    return new Set(collectAncestorIds(initialRegionId, parentMap));
  }, [initialRegionId, parentMap, regionsById]);

  const [showAllRegions, setShowAllRegions] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => initialPinned);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => (initialRegionId && regionsById.has(initialRegionId) ? initialRegionId : null),
  );
  const [rows, setRows] = useState<FlagRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddRegionSearch, setShowAddRegionSearch] = useState(false);
  const [showFlagTree, setShowFlagTree] = useState(false);
  const [flagTreeName, setFlagTreeName] = useState('');
  const [treeWidth, setTreeWidth] = useState(300);

  const [bulkFlag, setBulkFlag] = useState('');
  const [bulkAction, setBulkAction] = useState<'delete' | 'update'>('update');
  const [bulkValue, setBulkValue] = useState('');
  const [bulkTargets, setBulkTargets] = useState<string[]>([]);
  const [showBulkSearch, setShowBulkSearch] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const tree = useMemo(() => {
    if (showAllRegions) return scheme.forest.roots;
    return filterForestWithFlags(scheme.forest.roots, regionsById, pinnedIds);
  }, [scheme.forest.roots, regionsById, pinnedIds, showAllRegions]);

  // Initial / mode-switch collapse defaults.
  useEffect(() => {
    setCollapsedIds(defaultCollapsedWithoutFlagSubtrees(tree, regionsById));
  }, [showAllRegions]); // eslint-disable-line react-hooks/exhaustive-deps -- only on mode switch / mount

  useEffect(() => {
    // Keep collapse in sync when tree structure first loads in flags-only mode.
    setCollapsedIds((prev) => {
      if (prev.size > 0) return prev;
      return defaultCollapsedWithoutFlagSubtrees(tree, regionsById);
    });
  }, [tree, regionsById]);

  useEffect(() => {
    if (!initialRegionId) return;
    const ancestors = collectAncestorIds(initialRegionId, parentMap).slice(1);
    if (ancestors.length === 0) return;
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      for (const id of ancestors) next.delete(id);
      return next;
    });
  }, [initialRegionId, parentMap]);

  const treeIds = useMemo(() => {
    const ids: string[] = [];
    const walk = (nodes: ForestNode[]) => {
      for (const n of nodes) {
        ids.push(n.id);
        walk(n.children);
      }
    };
    walk(tree);
    return ids;
  }, [tree]);

  const flagDefTree = useMemo(() => {
    if (!flagTreeName.trim()) return [];
    return buildFlagDefinitionTree(scheme, flagTreeName.trim());
  }, [scheme, flagTreeName]);

  useEffect(() => {
    if (selectedId && !regionsById.has(selectedId)) {
      setSelectedId(treeIds[0] ?? null);
      return;
    }
    if (!selectedId && treeIds.length > 0) {
      setSelectedId(treeIds[0]);
    }
  }, [selectedId, treeIds, regionsById]);

  useEffect(() => {
    if (!selectedId) {
      setRows([]);
      setDirty(false);
      setError(null);
      return;
    }
    const region = regionsById.get(selectedId);
    setRows(flagsToRows(region?.flags ?? {}));
    setDirty(false);
    setError(null);
  }, [selectedId, regionsById]);

  const selectRegion = (id: string) => {
    if (id === selectedId) return;
    if (dirty && !window.confirm(t('flagsManager.unsavedConfirm'))) return;
    setSelectedId(id);
  };

  const updateRow = (key: string, patch: Partial<Pick<FlagRow, 'name' | 'value'>>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setDirty(true);
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((row) => row.key !== key));
    setDirty(true);
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { key: `new-${Date.now()}-${prev.length}`, name: '', value: '' },
    ]);
    setDirty(true);
  };

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(selectedId, rowsToFlags(rows));
      setDirty(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (dirty && !window.confirm(t('flagsManager.unsavedConfirm'))) return;
    onClose();
  };

  const handleAddRegion = (regionId: string) => {
    if (dirty && !window.confirm(t('flagsManager.unsavedConfirm'))) return;
    const pathIds = collectAncestorIds(regionId, parentMap);
    setPinnedIds((prev) => {
      const next = new Set(prev);
      for (const id of pathIds) next.add(id);
      return next;
    });
    setSelectedId(regionId);
    setShowAddRegionSearch(false);
  };

  const addBulkTarget = (regionId: string) => {
    setBulkTargets((prev) => (prev.includes(regionId) ? prev : [...prev, regionId].sort()));
    setShowBulkSearch(false);
  };

  const removeBulkTarget = (regionId: string) => {
    setBulkTargets((prev) => prev.filter((id) => id !== regionId));
  };

  const handleBulkApply = async (forAll: boolean) => {
    const flag = bulkFlag.trim();
    if (!flag) {
      setBulkMessage(t('flagsManager.bulkNeedFlag'));
      return;
    }
    if (!forAll && bulkTargets.length === 0) {
      setBulkMessage(t('flagsManager.bulkNeedTargets'));
      return;
    }
    if (bulkAction === 'update' && bulkValue.trim() === '') {
      setBulkMessage(t('flagsManager.bulkNeedValue'));
      return;
    }
    const confirmMsg = forAll
      ? t('flagsManager.bulkConfirmAll', { action: bulkAction, flag })
      : t('flagsManager.bulkConfirmList', {
        action: bulkAction,
        flag,
        count: bulkTargets.length,
      });
    if (!window.confirm(confirmMsg)) return;

    setBulkBusy(true);
    setBulkMessage(null);
    try {
      const result = await onBulk({
        flag,
        action: bulkAction,
        value: bulkAction === 'update' ? parseFlagValue(bulkValue) : undefined,
        regionIds: forAll ? null : bulkTargets,
      });
      setBulkMessage(t('flagsManager.bulkDone', { count: result.count }));
    } catch (err) {
      setBulkMessage(String(err));
    } finally {
      setBulkBusy(false);
    }
  };

  const regionsOutsideTree = useMemo(() => {
    const inTree = new Set(treeIds);
    return allRegionIds.filter((id) => !inTree.has(id));
  }, [allRegionIds, treeIds]);

  const toggleShowAll = () => {
    setShowAllRegions((prev) => !prev);
  };

  const toggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setCollapsedIds(new Set());
  const collapseAll = () => setCollapsedIds(new Set(treeIds));

  const applyFlagTreeHighlight = () => {
    const name = flagTreeName.trim();
    if (!name) return;
    onHighlightFlag(name);
  };

  const onTreeResizeStart = (event: ReactMouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = treeWidth;
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(560, Math.max(200, startWidth + (ev.clientX - startX)));
      setTreeWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <>
      <div className="modal-overlay" onClick={handleClose}>
        <div className="modal flags-manager-modal" onClick={(e) => e.stopPropagation()}>
          <header>
            <h2>{t('flagsManager.title')}</h2>
            <button type="button" onClick={handleClose}>×</button>
          </header>
          <div className="flags-manager-body">
            <aside className="flags-manager-tree" style={{ width: treeWidth }}>
              <div className="flags-manager-tree-header">
                <p className="flags-manager-tree-hint">{t('flagsManager.treeHint')}</p>
                {!showAllRegions && (
                  <button
                    type="button"
                    className="flags-add-region-btn"
                    title={t('flagsManager.addRegion')}
                    onClick={() => setShowAddRegionSearch(true)}
                    disabled={regionsOutsideTree.length === 0}
                  >
                    +
                  </button>
                )}
              </div>
              <div className="flags-tree-toolbar">
                <button type="button" onClick={toggleShowAll}>
                  {showAllRegions ? t('flagsManager.showWithFlags') : t('flagsManager.showAll')}
                </button>
                <button
                  type="button"
                  className="flags-tree-icon-btn"
                  onClick={expandAll}
                  title={t('flagsManager.expandAll')}
                >
                  <IconExpandAll size={SIDEBAR_ICON_SIZE} />
                  <span className="sr-only">{t('flagsManager.expandAll')}</span>
                </button>
                <button
                  type="button"
                  className="flags-tree-icon-btn"
                  onClick={collapseAll}
                  title={t('flagsManager.collapseAll')}
                >
                  <IconCollapseAll size={SIDEBAR_ICON_SIZE} />
                  <span className="sr-only">{t('flagsManager.collapseAll')}</span>
                </button>
                <button type="button" onClick={() => setShowFlagTree((v) => !v)}>
                  {t('flagsManager.flagTree')}
                </button>
                <button type="button" onClick={onOpenCatalog}>{t('flagsManager.openCatalog')}</button>
              </div>
              {showFlagTree && (
                <div className="flags-flag-tree-panel">
                  <div className="flag-pick-row">
                    <label>
                      {t('flagsManager.flagTreePick')}
                      <select
                        value={flagTreeName}
                        onChange={(e) => setFlagTreeName(e.target.value)}
                      >
                        <option value="">{t('flagsManager.flagTreePickEmpty')}</option>
                        {flagPickOptions.map((name) => {
                          const info = flagsCatalog.find((f) => f.name === name);
                          const label = info ? `${name} (${info.type})` : name;
                          return (
                            <option key={name} value={name}>
                              {label}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                    <FlagHelpButton name={flagTreeName} flagsCatalog={flagsCatalog} />
                  </div>
                  <div className="modal-actions">
                    <button type="button" onClick={applyFlagTreeHighlight} disabled={!flagTreeName.trim()}>
                      {t('flagsManager.flagTreeOnScheme')}
                    </button>
                    {highlightFlag && (
                      <button type="button" onClick={() => onHighlightFlag(null)}>
                        {t('flagsManager.flagTreeClear')}
                      </button>
                    )}
                  </div>
                  {flagTreeName.trim() && (
                    flagDefTree.length === 0 ? (
                      <p className="flags-manager-empty">{t('flagsManager.flagTreeEmpty')}</p>
                    ) : (
                      <>
                        <p className="flags-manager-tree-hint">{t('flagsManager.flagTreeHint')}</p>
                        <ul className="flags-tree">
                          {flagDefTree.map((node) => (
                            <FlagDefTreeNode
                              key={node.id}
                              node={node}
                              depth={0}
                              onSelect={selectRegion}
                            />
                          ))}
                        </ul>
                      </>
                    )
                  )}
                </div>
              )}
              {tree.length === 0 ? (
                <p className="flags-manager-empty">{t('flagsManager.empty')}</p>
              ) : (
                <ul className="flags-tree">
                  {tree.map((node) => (
                    <TreeNode
                      key={node.id}
                      node={node}
                      regionsById={regionsById}
                      selectedId={selectedId}
                      depth={0}
                      collapsedIds={collapsedIds}
                      onSelect={selectRegion}
                      onToggleCollapse={toggleCollapse}
                    />
                  ))}
                </ul>
              )}
            </aside>
            <div
              className="flags-manager-resize"
              onMouseDown={onTreeResizeStart}
              role="separator"
              aria-orientation="vertical"
              aria-label={t('flagsManager.resizeTree')}
            />

            <section className="flags-manager-editor">
              {!selectedId ? (
                <p className="flags-manager-empty">{t('flagsManager.selectRegion')}</p>
              ) : (
                <>
                  <h3>{selectedId}</h3>
                  <div className="flags-table-wrap">
                    <table className="flags-table flags-edit-table">
                      <thead>
                        <tr>
                          <th>{t('region.flagName')}</th>
                          <th>{t('region.flagValue')}</th>
                          <th>{t('region.flagType')}</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length === 0 ? (
                          <tr>
                            <td colSpan={4}>{t('region.noFlags')}</td>
                          </tr>
                        ) : (
                          rows.map((row) => {
                            const info = findFlagInfo(flagsCatalog, row.name);
                            return (
                              <tr key={row.key}>
                                <td>
                                  <FlagNameCombobox
                                    value={row.name}
                                    flagsCatalog={flagsCatalog}
                                    onChange={(name) => updateRow(row.key, { name })}
                                    placeholder={t('flagsManager.namePlaceholder')}
                                  />
                                </td>
                                <td>
                                  <FlagValueInput
                                    value={row.value}
                                    flagType={info?.type}
                                    onChange={(value) => updateRow(row.key, { value })}
                                    placeholder={t('flagsManager.valuePlaceholder')}
                                  />
                                </td>
                                <td>{info?.type ?? '—'}</td>
                                <td>
                                  <button
                                    type="button"
                                    className="flags-row-remove"
                                    onClick={() => removeRow(row.key)}
                                    title={t('flagsManager.remove')}
                                  >
                                    ×
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  {error && <p className="flags-manager-error">{error}</p>}
                  <div className="modal-actions">
                    <button type="button" onClick={addRow}>{t('flagsManager.add')}</button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={!dirty || saving}
                    >
                      {saving ? t('flagsManager.saving') : t('flagsManager.save')}
                    </button>
                  </div>
                </>
              )}

              <div className="flags-bulk-panel">
                <h3>{t('flagsManager.bulkTitle')}</h3>
                <p className="flags-manager-tree-hint">{t('flagsManager.bulkHint')}</p>
                <div className="flags-bulk-row">
                  <label>
                    {t('flagsManager.bulkFlag')}
                    <FlagNameCombobox
                      value={bulkFlag}
                      flagsCatalog={flagsCatalog}
                      onChange={setBulkFlag}
                      placeholder={t('flagsManager.namePlaceholder')}
                    />
                  </label>
                  <label>
                    {t('flagsManager.bulkAction')}
                    <select
                      value={bulkAction}
                      onChange={(e) => setBulkAction(e.target.value as 'delete' | 'update')}
                    >
                      <option value="update">{t('flagsManager.bulkUpdate')}</option>
                      <option value="delete">{t('flagsManager.bulkDelete')}</option>
                    </select>
                  </label>
                  {bulkAction === 'update' && (
                    <label>
                      {t('flagsManager.bulkValue')}
                      <FlagValueInput
                        value={bulkValue}
                        flagType={findFlagInfo(flagsCatalog, bulkFlag)?.type}
                        onChange={setBulkValue}
                        placeholder={t('flagsManager.valuePlaceholder')}
                      />
                    </label>
                  )}
                </div>
                <div className="flags-bulk-targets">
                  <div className="flags-bulk-targets-header">
                    <span>{t('flagsManager.bulkTargets', { count: bulkTargets.length })}</span>
                    <button type="button" onClick={() => setShowBulkSearch(true)}>
                      {t('flagsManager.bulkAddTarget')}
                    </button>
                  </div>
                  {bulkTargets.length > 0 && (
                    <ul className="flags-bulk-target-list">
                      {bulkTargets.map((id) => (
                        <li key={id}>
                          <span>{id}</span>
                          <button type="button" onClick={() => removeBulkTarget(id)}>×</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {bulkMessage && <p className="flags-bulk-message">{bulkMessage}</p>}
                <div className="modal-actions">
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => handleBulkApply(false)}
                  >
                    {t('flagsManager.bulkApplyList')}
                  </button>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => handleBulkApply(true)}
                  >
                    {t('flagsManager.bulkApplyAll')}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {showAddRegionSearch && (
        <SearchPanel
          regionIds={regionsOutsideTree}
          onClose={() => setShowAddRegionSearch(false)}
          onSelect={handleAddRegion}
        />
      )}
      {showBulkSearch && (
        <SearchPanel
          regionIds={allRegionIds}
          onClose={() => setShowBulkSearch(false)}
          onSelect={addBulkTarget}
        />
      )}
    </>
  );
}
