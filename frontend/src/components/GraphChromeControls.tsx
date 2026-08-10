import type { EdgeDisplayFilters, GraphViewHandle } from './GraphView';
import { FlagHelpButton } from './FlagHelpButton';
import {
  IconAdd,
  IconAlign,
  IconClearHighlight,
  IconCollapseAll,
  IconEdgeFilter,
  IconExpandAll,
  IconExpandThreshold,
  IconFlag,
  IconFlagHighlightOpts,
  IconFullscreen,
  IconFullscreenExit,
  IconLegend,
  IconLock,
  IconSearch,
  IconUnlock,
  IconWarning,
  IconZoomIn,
  IconZoomOut,
} from './GraphControlIcons';
import {
  NotificationsBell,
  type AppNotification,
} from './NotificationsBell';
import type { FlagInfo } from '../types';
import { useI18n } from '../i18n/I18nContext';

export type GraphChromeActions = {
  toggleSidebarCollapsed: () => void;
  openAddDialog: () => void;
  handleCollapseAll: () => void;
  handleExpandAll: () => void;
  handleExpandThreshold: () => void;
  openSearch: () => void;
  toggleNotifications: () => void;
  closeNotifications: () => void;
  refreshNotifications: () => void;
  markAllNotificationsRead: (level: 'error' | 'warning') => void;
  clearWarningNotifications: () => void;
  dismissNotification: (id: string) => void;
  openNotification: (n: AppNotification) => void;
  clearSpecialHighlight: () => void;
  toggleGraphLocked: () => void;
  relayout: () => void;
  openFlagTree: () => void;
  toggleBottomLeftMenu: (which: 'flagOpts' | 'edge' | 'problems') => void;
  setFlagHighlightShowIntersects: (v: boolean) => void;
  setFlagHighlightShowContains: (v: boolean) => void;
  setFlagHighlightShowInheritance: (v: boolean) => void;
  setFlagHighlightShowConflicts: (v: boolean) => void;
  setEdgeDisplayFilters: React.Dispatch<React.SetStateAction<EdgeDisplayFilters>>;
  setProblemsMode: (mode: 'error' | 'warning' | null) => void;
  openLegend: () => void;
  toggleFullscreen: () => void;
  openFlagsManagerForFlag: (flag: string) => void;
  applyHighlightFlag: (flag: string) => void;
  focusRegion: (id: string) => void;
};

export type GraphChromeControlsProps = {
  graphRef: React.RefObject<GraphViewHandle | null>;
  sidebarCollapsed: boolean;
  busyMessage: string | null;
  highlightFlag: string | null;
  collapseTarget: string | null;
  flagsCatalog: FlagInfo[];
  notifications: AppNotification[];
  showNotifications: boolean;
  graphLocked: boolean;
  subtreeHighlightRoot: string | null;
  problemFilter: 'error' | 'warning' | null;
  flagHighlightShowIntersects: boolean;
  flagHighlightShowContains: boolean;
  flagHighlightShowInheritance: boolean;
  flagHighlightShowConflicts: boolean;
  showFlagHighlightOptsMenu: boolean;
  showEdgeModeMenu: boolean;
  showProblemsMenu: boolean;
  edgeDisplayFilters: EdgeDisplayFilters;
  isFullscreen: boolean;
  actions: GraphChromeActions;
};

export function GraphChromeControls({
  graphRef,
  sidebarCollapsed,
  busyMessage,
  highlightFlag,
  collapseTarget,
  flagsCatalog,
  notifications,
  showNotifications,
  graphLocked,
  subtreeHighlightRoot,
  problemFilter,
  flagHighlightShowIntersects,
  flagHighlightShowContains,
  flagHighlightShowInheritance,
  flagHighlightShowConflicts,
  showFlagHighlightOptsMenu,
  showEdgeModeMenu,
  showProblemsMenu,
  edgeDisplayFilters,
  isFullscreen,
  actions: a,
}: GraphChromeControlsProps) {
  const { t } = useI18n();

  return (
    <>
      {(highlightFlag || collapseTarget) && (
        <div className="graph-selected-labels">
          {highlightFlag && (
            <div className="graph-selected-flag-row">
              <FlagHelpButton
                name={highlightFlag}
                flagsCatalog={flagsCatalog}
                placement="inline"
              />
              <button
                type="button"
                className="flag-help-btn flag-scheme-btn"
                title={t('app.selectedFlagOpenManager')}
                aria-label={t('app.selectedFlagOpenManager')}
                onClick={() => a.openFlagsManagerForFlag(highlightFlag)}
              >
                <span aria-hidden>⚑</span>
              </button>
              <button
                type="button"
                className="graph-selected-label"
                title={t('app.selectedFlagLabelHint', { flag: highlightFlag })}
                onClick={() => a.applyHighlightFlag(highlightFlag)}
              >
                {t('app.selectedFlagLabel', { flag: highlightFlag })}
              </button>
            </div>
          )}
          {collapseTarget && (
            <button
              type="button"
              className="graph-selected-label"
              title={t('app.selectedLabelHint', { id: collapseTarget })}
              onClick={() => a.focusRegion(collapseTarget)}
            >
              {t('app.selectedLabel', { id: collapseTarget })}
            </button>
          )}
        </div>
      )}
      <div className="graph-map-controls graph-map-controls--top-left">
        <button
          type="button"
          className="graph-ctrl-btn"
          onClick={a.toggleSidebarCollapsed}
          title={sidebarCollapsed ? t('app.expandSidebar') : t('app.collapseSidebar')}
        >
          {sidebarCollapsed ? '»' : '«'}
        </button>
        <button type="button" className="graph-ctrl-btn" onClick={a.openAddDialog} title={t('app.addManual')} disabled={Boolean(busyMessage)}>
          <IconAdd />
        </button>
      </div>
      <div className="graph-map-controls graph-map-controls--top-right">
        <button
          type="button"
          className="graph-ctrl-btn"
          onClick={a.handleCollapseAll}
          title={t('app.collapseAll')}
          disabled={Boolean(busyMessage)}
        >
          <IconCollapseAll />
        </button>
        <button
          type="button"
          className="graph-ctrl-btn"
          onClick={a.handleExpandAll}
          title={t('app.expandAll')}
          disabled={Boolean(busyMessage)}
        >
          <IconExpandAll />
        </button>
        <button
          type="button"
          className="graph-ctrl-btn"
          onClick={a.handleExpandThreshold}
          title={t('app.expandThreshold')}
          disabled={Boolean(busyMessage)}
        >
          <IconExpandThreshold />
        </button>
        <button type="button" className="graph-ctrl-btn" onClick={a.openSearch} title={t('app.search')}>
          <IconSearch />
        </button>
        <NotificationsBell
          open={showNotifications}
          notifications={notifications}
          onToggle={a.toggleNotifications}
          onClose={a.closeNotifications}
          onRefresh={a.refreshNotifications}
          onMarkAllRead={a.markAllNotificationsRead}
          onClear={a.clearWarningNotifications}
          onDismiss={a.dismissNotification}
          onOpenItem={a.openNotification}
        />
      </div>
      <div className="graph-map-controls graph-map-controls--bottom-left">
        {(highlightFlag || subtreeHighlightRoot || problemFilter) && (
          <button
            type="button"
            className="graph-ctrl-btn"
            onClick={a.clearSpecialHighlight}
            title={t('app.clearSpecialHighlight')}
            aria-label={t('app.clearSpecialHighlight')}
          >
            <IconClearHighlight />
          </button>
        )}
        <button
          type="button"
          className={`graph-ctrl-btn${graphLocked ? ' graph-ctrl-btn--active' : ''}`}
          onClick={a.toggleGraphLocked}
          title={t(graphLocked ? 'graph.unlock' : 'graph.lock')}
          aria-pressed={graphLocked}
        >
          {graphLocked ? <IconLock /> : <IconUnlock />}
        </button>
        <button
          type="button"
          className="graph-ctrl-btn"
          onClick={a.relayout}
          title={t('app.relayout')}
          disabled={Boolean(busyMessage)}
        >
          <IconAlign />
        </button>
        <button
          type="button"
          className={`graph-ctrl-btn${highlightFlag ? ' graph-ctrl-btn--active' : ''}`}
          onClick={a.openFlagTree}
          title={t('flagsManager.flagHighlightTitle')}
          disabled={Boolean(busyMessage)}
        >
          <IconFlag />
        </button>
        {highlightFlag && (
          <div className="graph-problems-root" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={`graph-ctrl-btn${
                flagHighlightShowIntersects
                || flagHighlightShowContains
                || flagHighlightShowInheritance
                || flagHighlightShowConflicts
                  ? ' graph-ctrl-btn--active'
                  : ''
              }`}
              onClick={() => a.toggleBottomLeftMenu('flagOpts')}
              title={t('app.flagHighlightOptions')}
              aria-pressed={
                flagHighlightShowIntersects
                || flagHighlightShowContains
                || flagHighlightShowInheritance
                || flagHighlightShowConflicts
              }
              aria-expanded={showFlagHighlightOptsMenu}
            >
              <IconFlagHighlightOpts />
            </button>
            {showFlagHighlightOptsMenu && (
              <div className="graph-problems-menu" role="menu">
                <label className="graph-menu-check">
                  <input
                    type="checkbox"
                    checked={flagHighlightShowIntersects}
                    onChange={(e) => a.setFlagHighlightShowIntersects(e.target.checked)}
                  />
                  <span>{t('app.flagHighlightShowIntersects')}</span>
                </label>
                <label className="graph-menu-check">
                  <input
                    type="checkbox"
                    checked={flagHighlightShowContains}
                    onChange={(e) => a.setFlagHighlightShowContains(e.target.checked)}
                  />
                  <span>{t('app.flagHighlightShowContains')}</span>
                </label>
                <label className="graph-menu-check">
                  <input
                    type="checkbox"
                    checked={flagHighlightShowInheritance}
                    onChange={(e) => a.setFlagHighlightShowInheritance(e.target.checked)}
                  />
                  <span>{t('app.flagHighlightShowInheritance')}</span>
                </label>
                <label className="graph-menu-check">
                  <input
                    type="checkbox"
                    checked={flagHighlightShowConflicts}
                    onChange={(e) => a.setFlagHighlightShowConflicts(e.target.checked)}
                  />
                  <span>{t('app.flagHighlightShowConflicts')}</span>
                </label>
              </div>
            )}
          </div>
        )}
        <div className="graph-problems-root" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`graph-ctrl-btn${
              !(
                edgeDisplayFilters.intersects
                && edgeDisplayFilters.contains
                && edgeDisplayFilters.hierarchy
              )
                ? ' graph-ctrl-btn--active'
                : ''
            }`}
            onClick={() => a.toggleBottomLeftMenu('edge')}
            title={t('app.edgeDisplayMode')}
            aria-pressed={!(
              edgeDisplayFilters.intersects
              && edgeDisplayFilters.contains
              && edgeDisplayFilters.hierarchy
            )}
            aria-expanded={showEdgeModeMenu}
          >
            <IconEdgeFilter />
          </button>
          {showEdgeModeMenu && (
            <div className="graph-problems-menu" role="menu">
              {(
                [
                  ['intersects', 'app.edgeFilterIntersects'],
                  ['contains', 'app.edgeFilterContains'],
                  ['hierarchy', 'app.edgeFilterHierarchy'],
                ] as const
              ).map(([key, labelKey]) => (
                <label key={key} className="graph-menu-check">
                  <input
                    type="checkbox"
                    checked={edgeDisplayFilters[key]}
                    onChange={(e) => {
                      const on = e.target.checked;
                      a.setEdgeDisplayFilters((prev) => ({ ...prev, [key]: on }));
                    }}
                  />
                  <span>{t(labelKey)}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="graph-problems-root" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`graph-ctrl-btn${problemFilter ? ' graph-ctrl-btn--warn-active' : ''}`}
            onClick={() => a.toggleBottomLeftMenu('problems')}
            title={t('app.problemsMode')}
            aria-pressed={Boolean(problemFilter)}
            aria-expanded={showProblemsMenu}
          >
            <IconWarning />
          </button>
          {showProblemsMenu && (
            <div className="graph-problems-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className={problemFilter === 'error' ? 'active' : ''}
                onClick={() => a.setProblemsMode('error')}
              >
                {t('app.problemsErrors')}
              </button>
              <button
                type="button"
                role="menuitem"
                className={problemFilter === 'warning' ? 'active' : ''}
                onClick={() => a.setProblemsMode('warning')}
              >
                {t('app.problemsWarnings')}
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="graph-map-controls graph-map-controls--bottom-right">
        <button
          type="button"
          className="graph-ctrl-btn"
          onClick={a.openLegend}
          title={t('app.legend')}
        >
          <IconLegend />
        </button>
        <button type="button" className="graph-ctrl-btn" onClick={() => graphRef.current?.zoomIn()} title={t('graph.zoomIn')}>
          <IconZoomIn />
        </button>
        <button type="button" className="graph-ctrl-btn" onClick={() => graphRef.current?.zoomOut()} title={t('graph.zoomOut')}>
          <IconZoomOut />
        </button>
        <button
          type="button"
          className={`graph-ctrl-btn${isFullscreen ? ' graph-ctrl-btn--active' : ''}`}
          onClick={() => { void a.toggleFullscreen(); }}
          title={t(isFullscreen ? 'graph.fullscreenExitF' : 'graph.fullscreenF')}
          aria-pressed={isFullscreen}
        >
          {isFullscreen ? <IconFullscreenExit /> : <IconFullscreen />}
        </button>
      </div>
    </>
  );
}

export function EmptySchemeChrome({
  sidebarCollapsed,
  onToggleSidebar,
}: {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="graph-map-controls graph-map-controls--top-left">
        <button
          type="button"
          className="graph-ctrl-btn"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? t('app.expandSidebar') : t('app.collapseSidebar')}
        >
          {sidebarCollapsed ? '»' : '«'}
        </button>
      </div>
      <div className="placeholder">{t('app.placeholder')}</div>
    </>
  );
}
