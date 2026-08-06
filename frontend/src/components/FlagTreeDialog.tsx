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
function filterForestForFlag(
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

interface FlagTreeDialogProps {
  scheme: Scheme;
  flagsCatalog: FlagInfo[];
  highlightFlag: string | null;
  onClose: () => void;
  onHighlightFlag: (flagName: string | null) => void;
  onSelectRegion?: (regionId: string) => void;
  /** When set, confirm before applying highlight if caller reports dirty state. */
  confirmUnsaved?: () => boolean;
}

/** Standalone «view flag tree» modal (also used from the scheme map). */
export function FlagTreeDialog({
  scheme,
  flagsCatalog,
  highlightFlag,
  onClose,
  onHighlightFlag,
  onSelectRegion,
  confirmUnsaved,
}: FlagTreeDialogProps) {
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
    onClose();
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal flags-flag-tree-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('flagsManager.flagTree')}</h2>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="modal-body">
          <div className="flag-pick-row">
            <label>
              {t('flagsManager.flagTreePick')}
              <select value={flagTreeName} onChange={(e) => setFlagTreeName(e.target.value)}>
                <option value="">{t('flagsManager.flagTreePickEmpty')}</option>
                {flagPickOptions.map((name) => {
                  const info = flagsCatalog.find((flag) => flag.name === name);
                  const label = info ? `${name} (${info.type})` : name;
                  return <option key={name} value={name}>{label}</option>;
                })}
              </select>
            </label>
            <FlagHelpButton name={flagTreeName} flagsCatalog={flagsCatalog} />
          </div>
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
        </div>
      </div>
    </ModalOverlay>
  );
}
