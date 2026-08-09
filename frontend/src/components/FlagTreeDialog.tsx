import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { FlagInfo, ForestNode, Scheme } from '../types';
import { listUsedFlagNames } from '../utils/flagTree';
import { FlagNameCombobox } from './FlagNameCombobox';
import { ModalOverlay } from './ModalOverlay';

/** Keep defining / inheriting / pinned nodes and ancestors so the forest stays connected. */
export function filterForestForFlag(
  nodes: ForestNode[],
  definingIds: Set<string>,
  effectiveIds: Set<string>,
  pinnedIds: Set<string> = new Set(),
): ForestNode[] {
  const result: ForestNode[] = [];
  for (const node of nodes) {
    const children = filterForestForFlag(
      node.children,
      definingIds,
      effectiveIds,
      pinnedIds,
    );
    const keep =
      definingIds.has(node.id)
      || effectiveIds.has(node.id)
      || pinnedIds.has(node.id)
      || children.length > 0;
    if (keep) {
      result.push({ ...node, children });
    }
  }
  return result;
}

interface FlagTreeDialogProps {
  scheme: Scheme;
  flagsCatalog: FlagInfo[];
  onClose: () => void;
  onHighlightFlag: (flagName: string | null) => void;
  /** When set, confirm before applying highlight if caller reports dirty state. */
  confirmUnsaved?: () => boolean;
}

/** Compact scheme control: pick a flag (search) and display it on the map. */
export function FlagTreeDialog({
  scheme,
  flagsCatalog,
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
  const [flagName, setFlagName] = useState('');

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
