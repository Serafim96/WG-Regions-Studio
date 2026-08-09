import type { HighlightBranchMode } from './types';
import type { ContextMenuState } from './types';
import { useI18n } from '../../i18n/I18nContext';

export type GraphContextMenuProps = {
  contextMenu: ContextMenuState;
  contextMenuRef: React.RefObject<HTMLDivElement | null> | React.RefCallback<HTMLDivElement>;
  contextIsGlobal: boolean;
  subtreeHighlightActive: boolean;
  onClose: () => void;
  onNodeOpen: (regionId: string) => void;
  onCopyName: (regionId: string) => void;
  onRename?: (regionId: string) => void;
  onAddManual: () => void;
  onAddDescendant: (regionId: string) => void;
  onDeleteManual: (regionId: string) => void;
  onOpenFlagsManager: (regionId: string) => void;
  onCollapseChildren: (regionId: string) => void;
  onExpandChildren: (regionId: string) => void;
  onCollapseRecursive: (regionId: string) => void;
  onExpandRecursive: (regionId: string) => void;
  onHighlightSubtree: (regionId: string, mode: HighlightBranchMode) => void;
  onClearSubtreeHighlight: () => void;
};

function blockBrowserMenu(e: React.MouseEvent) {
  e.preventDefault();
}

export function GraphContextMenu({
  contextMenu,
  contextMenuRef,
  contextIsGlobal,
  subtreeHighlightActive,
  onClose,
  onNodeOpen,
  onCopyName,
  onRename,
  onAddManual,
  onAddDescendant,
  onDeleteManual,
  onOpenFlagsManager,
  onCollapseChildren,
  onExpandChildren,
  onCollapseRecursive,
  onExpandRecursive,
  onHighlightSubtree,
  onClearSubtreeHighlight,
}: GraphContextMenuProps) {
  const { t } = useI18n();

  if (!contextMenu.nodeId) {
    return (
      <div
        ref={contextMenuRef as React.Ref<HTMLDivElement>}
        className="node-context-menu"
        style={{ left: contextMenu.x, top: contextMenu.y }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={blockBrowserMenu}
      >
        <button
          type="button"
          onClick={() => {
            onAddManual();
            onClose();
          }}
        >
          {t('graph.addManualRegion')}
        </button>
      </div>
    );
  }

  const nodeId = contextMenu.nodeId;

  return (
    <div
      ref={contextMenuRef as React.Ref<HTMLDivElement>}
      className="node-context-menu"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={blockBrowserMenu}
    >
      <button type="button" onClick={() => { onNodeOpen(nodeId); onClose(); }}>
        {t('graph.properties')}
      </button>
      <button type="button" onClick={() => { onCopyName(nodeId); onClose(); }}>
        {t('graph.copyName')}
      </button>
      {onRename && (
        <button type="button" onClick={() => { onRename(nodeId); onClose(); }}>
          {t('graph.rename')}
        </button>
      )}
      <button type="button" onClick={() => { onAddDescendant(nodeId); onClose(); }}>
        {t('graph.addDescendant')}
      </button>
      <button type="button" onClick={() => { onOpenFlagsManager(nodeId); onClose(); }}>
        {t('graph.flagsManager')}
      </button>
      <div className="node-context-menu-item has-submenu">
        <button type="button" className="node-context-menu-parent">
          {t('graph.highlightSubtree')}
          <span className="node-context-menu-caret">▸</span>
        </button>
        <div className="node-context-submenu">
          <button
            type="button"
            onClick={() => { onHighlightSubtree(nodeId, 'full'); onClose(); }}
          >
            {t('graph.highlightSubtreeFull')}
          </button>
          <button
            type="button"
            onClick={() => { onHighlightSubtree(nodeId, 'children'); onClose(); }}
          >
            {t('graph.highlightSubtreeChildren')}
          </button>
          {!contextIsGlobal && (
            <>
              <button
                type="button"
                onClick={() => {
                  onHighlightSubtree(nodeId, 'intersects');
                  onClose();
                }}
              >
                {t('graph.highlightSubtreeIntersects')}
              </button>
              <div className="node-context-menu-item has-submenu node-context-menu-item--nested">
                <button type="button" className="node-context-menu-parent">
                  {t('graph.highlightSubtreeContainment')}
                  <span className="node-context-menu-caret">▸</span>
                </button>
                <div className="node-context-submenu">
                  <button
                    type="button"
                    onClick={() => {
                      onHighlightSubtree(nodeId, 'containment-all');
                      onClose();
                    }}
                  >
                    {t('graph.highlightSubtreeContainmentAll')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onHighlightSubtree(nodeId, 'containment-children');
                      onClose();
                    }}
                  >
                    {t('graph.highlightSubtreeContainmentChildren')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onHighlightSubtree(nodeId, 'containment-parents');
                      onClose();
                    }}
                  >
                    {t('graph.highlightSubtreeContainmentParents')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {subtreeHighlightActive && (
        <button type="button" onClick={() => { onClearSubtreeHighlight(); onClose(); }}>
          {t('graph.clearSubtreeHighlight')}
        </button>
      )}
      <button
        type="button"
        className="danger-menu-item"
        onClick={() => { onDeleteManual(nodeId); onClose(); }}
      >
        {t('graph.deleteManual')}
      </button>
      <button type="button" onClick={() => { onCollapseChildren(nodeId); onClose(); }}>
        {t('graph.hideChildren')}
      </button>
      <button type="button" onClick={() => { onCollapseRecursive(nodeId); onClose(); }}>
        {t('graph.collapseRecursive')}
      </button>
      <button type="button" onClick={() => { onExpandChildren(nodeId); onClose(); }}>
        {t('graph.showChildren')}
      </button>
      <button type="button" onClick={() => { onExpandRecursive(nodeId); onClose(); }}>
        {t('graph.expandRecursive')}
      </button>
    </div>
  );
}
