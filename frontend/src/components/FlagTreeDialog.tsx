import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { FlagInfo, ForestNode, RegionData, Scheme } from '../types';
import { computeEffectiveFlagsByRegion } from '../utils/flagConflicts';
import {
  defaultCollapsedWithoutNamedFlag,
  listUsedFlagNames,
} from '../utils/flagTree';
import {
  IconExpandAll,
  IconCollapseAll,
  IconTreeChevron,
  SIDEBAR_ICON_SIZE,
  TREE_ICON_SIZE,
} from './GraphControlIcons';
import { FlagHelpButton } from './FlagHelpButton';
import { FlagNameCombobox } from './FlagNameCombobox';
import { ModalOverlay } from './ModalOverlay';

function formatFlagValue(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Keep defining / inheriting nodes and ancestors so the forest stays connected. */
export function filterForestForFlag(
  nodes: ForestNode[],
  definingIds: Set<string>,
  effectiveIds: Set<string>,
): ForestNode[] {
  const result: ForestNode[] = [];
  for (const node of nodes) {
    const children = filterForestForFlag(node.children, definingIds, effectiveIds);
    const keep =
      definingIds.has(node.id)
      || effectiveIds.has(node.id)
      || children.length > 0;
    if (keep) {
      result.push({ ...node, children });
    }
  }
  return result;
}

function FlagForestNode({
  node,
  regionsById,
  definingIds,
  effective,
  flagName,
  depth,
  collapsedIds,
  onSelect,
  onToggleCollapse,
}: {
  node: ForestNode;
  regionsById: Map<string, RegionData>;
  definingIds: Set<string>;
  effective: Map<string, Map<string, unknown>>;
  flagName: string;
  depth: number;
  collapsedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const collapsed = collapsedIds.has(node.id);
  const defining = definingIds.has(node.id);
  const effMap = effective.get(node.id);
  const hasEffective = Boolean(effMap?.has(flagName));
  const value = defining
    ? regionsById.get(node.id)?.flags?.[flagName]
    : hasEffective
      ? effMap!.get(flagName)
      : undefined;
  const showValue = value !== undefined;

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
            defining ? 'has-flags' : 'no-flags',
            !defining && hasEffective ? 'flag-tree-inherit' : '',
          ].filter(Boolean).join(' ')}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => onSelect(node.id)}
        >
          <span>{node.id}</span>
          {showValue && (
            <span className="flags-tree-count">{formatFlagValue(value)}</span>
          )}
        </button>
      </div>
      {hasChildren && !collapsed && (
        <ul>
          {node.children.map((child) => (
            <FlagForestNode
              key={child.id}
              node={child}
              regionsById={regionsById}
              definingIds={definingIds}
              effective={effective}
              flagName={flagName}
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

export interface FlagTreeViewProps {
  scheme: Scheme;
  flagsCatalog: FlagInfo[];
  highlightFlag: string | null;
  onHighlightFlag: (flagName: string | null) => void;
  onSelectRegion?: (regionId: string) => void;
  /** When set, confirm before applying highlight if caller reports dirty state. */
  confirmUnsaved?: () => boolean;
  /** Hide scheme highlight actions (embedded read-only browse). */
  showSchemeActions?: boolean;
}

/** Two-column flag tree: used flags list + region inheritance tree. */
export function FlagTreeView({
  scheme,
  flagsCatalog,
  highlightFlag,
  onHighlightFlag,
  onSelectRegion,
  confirmUnsaved,
  showSchemeActions = true,
}: FlagTreeViewProps) {
  const { t } = useI18n();
  const [flagTreeName, setFlagTreeName] = useState(highlightFlag ?? '');
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());

  const regionsById = useMemo(
    () => new Map(scheme.regions.map((r) => [r.id, r])),
    [scheme.regions],
  );
  const flagPickOptions = useMemo(() => listUsedFlagNames(scheme), [scheme]);
  const flagName = flagTreeName.trim();

  const definingIds = useMemo(() => {
    if (!flagName) return new Set<string>();
    return new Set(
      scheme.regions
        .filter((r) => Object.prototype.hasOwnProperty.call(r.flags || {}, flagName))
        .map((r) => r.id),
    );
  }, [scheme.regions, flagName]);

  const definingCountByFlag = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of scheme.regions) {
      for (const name of Object.keys(r.flags || {})) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
    return counts;
  }, [scheme.regions]);

  const effective = useMemo(
    () => (flagName ? computeEffectiveFlagsByRegion(scheme) : new Map()),
    [scheme, flagName],
  );

  const effectiveIds = useMemo(() => {
    if (!flagName) return new Set<string>();
    const ids = new Set<string>();
    for (const [id, flags] of effective) {
      if (flags.has(flagName)) ids.add(id);
    }
    return ids;
  }, [effective, flagName]);

  const tree = useMemo(() => {
    if (!flagName) return [];
    return filterForestForFlag(scheme.forest.roots, definingIds, effectiveIds);
  }, [scheme.forest.roots, definingIds, effectiveIds, flagName]);

  useEffect(() => {
    if (!flagName) {
      setCollapsedIds(new Set());
      return;
    }
    setCollapsedIds(defaultCollapsedWithoutNamedFlag(tree, regionsById, flagName));
  }, [flagName]); // eslint-disable-line react-hooks/exhaustive-deps -- reset collapse when flag changes

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

  const toggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyFlagTreeHighlight = () => {
    if (!flagName) return;
    if (confirmUnsaved && !confirmUnsaved()) return;
    onHighlightFlag(flagName);
  };

  const selectedFlagInfo = flagName
    ? flagsCatalog.find((flag) => flag.name === flagName)
    : undefined;

  return (
    <div className="flags-flag-tree-body">
      <aside className="flags-flag-tree-flags">
        <p className="flags-manager-tree-hint">{t('flagsManager.flagTreePick')}</p>
        {flagPickOptions.length === 0 ? (
          <p className="flags-manager-empty">{t('flagsManager.flagTreeNoFlags')}</p>
        ) : (
          <ul className="flags-tree">
            {flagPickOptions.map((name) => {
              const info = flagsCatalog.find((flag) => flag.name === name);
              const count = definingCountByFlag.get(name) ?? 0;
              return (
                <li key={name}>
                  <div className="flags-tree-row">
                    <span className="flags-tree-toggle-spacer" />
                    <button
                      type="button"
                      className={[
                        'flags-tree-item',
                        flagTreeName === name ? 'selected' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => setFlagTreeName(name)}
                      title={info ? `${name} (${info.type})` : name}
                    >
                      <span>{name}</span>
                      <span className="flags-tree-count">{count}</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <section className="flags-flag-tree-regions">
        <div className="flags-flag-tree-regions-toolbar">
          {flagName ? (
            <div className="flag-pick-row">
              <h3 className="flags-flag-tree-selected-name">{flagName}</h3>
              <FlagHelpButton name={flagTreeName} flagsCatalog={flagsCatalog} />
            </div>
          ) : (
            <p className="flags-manager-empty">{t('flagsManager.flagTreePickEmpty')}</p>
          )}
          {selectedFlagInfo && (
            <p className="flag-pick-desc">{selectedFlagInfo.type}</p>
          )}
          {showSchemeActions && (
            <div className="modal-actions">
              <button type="button" onClick={applyFlagTreeHighlight} disabled={!flagName}>
                {t('flagsManager.flagTreeOnScheme')}
              </button>
              {highlightFlag && (
                <button type="button" onClick={() => onHighlightFlag(null)}>
                  {t('flagsManager.flagTreeClear')}
                </button>
              )}
            </div>
          )}
        </div>

        {flagName && (
          definingIds.size === 0 ? (
            <p className="flags-manager-empty">{t('flagsManager.flagTreeEmpty')}</p>
          ) : (
            <>
              <p className="flags-manager-tree-hint">{t('flagsManager.flagTreeHint')}</p>
              <div className="flags-tree-toolbar">
                <button
                  type="button"
                  className="flags-tree-icon-btn"
                  title={t('app.expandAll')}
                  onClick={() => setCollapsedIds(new Set())}
                >
                  <IconExpandAll size={SIDEBAR_ICON_SIZE} />
                </button>
                <button
                  type="button"
                  className="flags-tree-icon-btn"
                  title={t('app.collapseAll')}
                  onClick={() => setCollapsedIds(new Set(treeIds))}
                >
                  <IconCollapseAll size={SIDEBAR_ICON_SIZE} />
                </button>
              </div>
              <ul className="flags-tree">
                {tree.map((node) => (
                  <FlagForestNode
                    key={node.id}
                    node={node}
                    regionsById={regionsById}
                    definingIds={definingIds}
                    effective={effective}
                    flagName={flagName}
                    depth={0}
                    collapsedIds={collapsedIds}
                    onSelect={(id) => onSelectRegion?.(id)}
                    onToggleCollapse={toggleCollapse}
                  />
                ))}
              </ul>
            </>
          )
        )}
      </section>
    </div>
  );
}

interface FlagTreeDialogProps {
  scheme: Scheme;
  flagsCatalog: FlagInfo[];
  highlightFlag: string | null;
  onClose: () => void;
  onHighlightFlag: (flagName: string | null) => void;
  /** When set, confirm before applying highlight if caller reports dirty state. */
  confirmUnsaved?: () => boolean;
}

/**
 * Compact scheme control: pick a flag (search) and display it on the map.
 * Full tree browsing lives in FlagsManagerDialog → «дерево флага».
 */
export function FlagTreeDialog({
  scheme,
  flagsCatalog,
  highlightFlag,
  onClose,
  onHighlightFlag,
  confirmUnsaved,
}: FlagTreeDialogProps) {
  const { t } = useI18n();
  const usedFlags = useMemo(() => listUsedFlagNames(scheme), [scheme]);
  const usedCatalog = useMemo(
    () => usedFlags.map((name) => {
      const info = flagsCatalog.find((f) => f.name === name);
      return info ?? { name, type: '', description: '', builtin: false };
    }),
    [usedFlags, flagsCatalog],
  );
  const [flagName, setFlagName] = useState(highlightFlag ?? '');

  const apply = () => {
    const name = flagName.trim();
    if (!name) return;
    if (confirmUnsaved && !confirmUnsaved()) return;
    onHighlightFlag(name);
    onClose();
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal flags-flag-highlight-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('flagsManager.flagHighlightTitle')}</h2>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="modal-body flags-flag-highlight-body">
          <label className="flags-flag-highlight-label">
            {t('flagsManager.flagTreePick')}
            <FlagNameCombobox
              value={flagName}
              flagsCatalog={usedCatalog}
              onChange={setFlagName}
              placeholder={t('flagsManager.namePlaceholder')}
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="primary" onClick={apply} disabled={!flagName.trim()}>
              {t('flagsManager.flagTreeDisplay')}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
