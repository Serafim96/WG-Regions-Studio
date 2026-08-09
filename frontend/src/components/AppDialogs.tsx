import {
  addCustomFlag,
  deleteAllCustomFlags,
  deleteCustomFlag,
  exportCustomFlags,
  fetchFlags,
  importCustomFlags,
} from '../api';
import { AddRegionDialog } from './AddRegionDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { DeleteManualRegionDialog, type DeleteChildrenMode } from './DeleteManualRegionDialog';
import { FlagConflictsDialog } from './FlagConflictsDialog';
import { FlagsManagerDialog } from './FlagsManagerDialog';
import { FlagsCatalogDialog } from './FlagsCatalogDialog';
import { ValidationResultDialog } from './ValidationResultDialog';
import { FlagTreeDialog } from './FlagTreeDialog';
import { LegendPanel } from './LegendPanel';
import { MetricsPanel } from './MetricsPanel';
import { RenameRegionDialog } from './RenameRegionDialog';
import { SearchPanel } from './SearchPanel';
import type { AppNotification } from './NotificationsBell';
import type { FlagInfo, RegionData, Scheme } from '../types';
import type { FlagConflictsResult, SpatialConflict } from '../utils/flagConflicts';
import type { SchemeIssue } from '../utils/schemeValidation';
import { downloadText } from '../utils/download';
import { useI18n } from '../i18n/I18nContext';

export type AppDialogsActions = {
  handleClearApp: () => void;
  handleConfirmResetScheme: () => void;
  handleConfirmOpenFile: () => void;
  doExportRegionsYaml: (includeManual: boolean) => void;
  closeValidation: () => void;
  closeMetrics: () => void;
  openRegionDetails: (id: string) => void;
  closeLegend: () => void;
  closeSearch: () => void;
  focusRegion: (id: string) => void;
  closeFlagTree: () => void;
  applyHighlightFlag: (name: string | null) => void;
  closeFlagsManager: () => void;
  handleUpdateFlags: (regionId: string, flags: Record<string, unknown>) => Promise<void>;
  handleBulkFlags: (payload: {
    flag: string;
    action: 'delete' | 'update';
    value?: unknown;
    regionIds: string[] | null;
  }) => Promise<{ count: number }>;
  handleClearAllFlags: () => Promise<{ count: number }>;
  openFlagsCatalog: () => void;
  setFlagsCatalog: React.Dispatch<React.SetStateAction<FlagInfo[]>>;
  setScheme: React.Dispatch<React.SetStateAction<Scheme | null>>;
  closeFlagsCatalog: () => void;
  handleAddManual: (data: {
    id: string;
    parent: string | null;
    priority: number;
    flags: Record<string, string>;
    geometry: {
      type: string;
      min?: { x: number; y: number; z: number };
      max?: { x: number; y: number; z: number };
      min_y?: number;
      max_y?: number;
      points?: { x: number; z: number }[];
    };
  }) => Promise<void>;
  closeAddDialog: () => void;
  handleRename: (regionId: string, newId: string) => Promise<void>;
  closeRename: () => void;
  handleConfirmDeleteManual: (mode: DeleteChildrenMode) => Promise<void>;
  closeDelete: () => void;
  closeFlagConflicts: () => void;
  showConflictOnScheme: (conflict: SpatialConflict) => void;
  showOverwriteOnScheme: (overwrite: {
    flagName: string;
    parentId: string;
    childId: string;
  }) => void;
  dismissAllToasts: () => void;
  openNotificationOnScheme: (n: AppNotification) => void;
  setShowClearConfirm: (v: boolean) => void;
  setShowResetConfirm: (v: boolean) => void;
  setShowOpenFileConfirm: (v: boolean) => void;
  setShowExportManualConfirm: (v: boolean) => void;
};

export type AppDialogsProps = {
  scheme: Scheme | null;
  flagsCatalog: FlagInfo[];
  flagConflicts: FlagConflictsResult | null;
  regionIdList: string[];
  parentMap: Map<string, string | null>;
  showClearConfirm: boolean;
  showResetConfirm: boolean;
  showOpenFileConfirm: boolean;
  showExportManualConfirm: boolean;
  validationDialog: {
    title: string;
    intro?: string;
    issues: SchemeIssue[];
    okMessage?: string;
  } | null;
  showMetrics: boolean;
  showLegend: boolean;
  showSearch: boolean;
  showFlagTreeDialog: boolean;
  showFlagsManager: boolean;
  flagsManagerFocusId: string | null;
  flagsManagerFilterFlag: string | null;
  showFlagsCatalog: boolean;
  showAddDialog: boolean;
  addDialogInitialParent: string | undefined;
  renameTargetId: string | null;
  deleteTarget: { regionId: string; childIds: string[]; parentId: string | null } | null;
  showFlagConflictsDialog: boolean;
  notificationToasts: AppNotification[];
  actions: AppDialogsActions;
};

export function AppDialogs({
  scheme,
  flagsCatalog,
  flagConflicts,
  regionIdList,
  parentMap,
  showClearConfirm,
  showResetConfirm,
  showOpenFileConfirm,
  showExportManualConfirm,
  validationDialog,
  showMetrics,
  showLegend,
  showSearch,
  showFlagTreeDialog,
  showFlagsManager,
  flagsManagerFocusId,
  flagsManagerFilterFlag,
  showFlagsCatalog,
  showAddDialog,
  addDialogInitialParent,
  renameTargetId,
  deleteTarget,
  showFlagConflictsDialog,
  notificationToasts,
  actions: a,
}: AppDialogsProps) {
  const { t } = useI18n();

  return (
    <>
      {showClearConfirm && (
        <div className="modal-overlay" onClick={() => a.setShowClearConfirm(false)}>
          <div className="modal clear-scheme-modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>{t('app.clearScheme')}</h2>
              <button type="button" onClick={() => a.setShowClearConfirm(false)}>×</button>
            </header>
            <div className="modal-body">
              <p>{t('app.clearSchemeConfirm')}</p>
              <div className="modal-actions">
                <button type="button" className="primary" onClick={() => a.setShowClearConfirm(false)}>
                  {t('app.no')}
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => { void a.handleClearApp(); }}
                >
                  {t('app.yes')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showResetConfirm && (
        <div className="modal-overlay" onClick={() => a.setShowResetConfirm(false)}>
          <div className="modal clear-scheme-modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>{t('app.updateScheme')}</h2>
              <button type="button" onClick={() => a.setShowResetConfirm(false)}>×</button>
            </header>
            <div className="modal-body">
              <p>{t('app.resetSchemeConfirm')}</p>
              <div className="modal-actions">
                <button type="button" className="primary" onClick={() => a.setShowResetConfirm(false)}>
                  {t('app.no')}
                </button>
                <button type="button" className="danger" onClick={() => { void a.handleConfirmResetScheme(); }}>
                  {t('app.yes')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showOpenFileConfirm && (
        <ConfirmDialog
          title={t('app.openFileConfirmTitle')}
          message={t('app.loadSchemeConfirm')}
          onCancel={() => a.setShowOpenFileConfirm(false)}
          onConfirm={() => { void a.handleConfirmOpenFile(); }}
        />
      )}

      {showExportManualConfirm && (
        <ConfirmDialog
          title={t('status.exportAskManualTitle')}
          message={t('status.exportAskManual')}
          confirmClass="success"
          onDismiss={() => a.setShowExportManualConfirm(false)}
          onCancel={() => {
            a.setShowExportManualConfirm(false);
            void a.doExportRegionsYaml(false);
          }}
          onConfirm={() => {
            a.setShowExportManualConfirm(false);
            void a.doExportRegionsYaml(true);
          }}
        />
      )}

      {validationDialog && (
        <ValidationResultDialog
          title={validationDialog.title}
          intro={validationDialog.intro}
          issues={validationDialog.issues}
          okMessage={validationDialog.okMessage}
          onClose={a.closeValidation}
        />
      )}

      {deleteTarget && (
        <DeleteManualRegionDialog
          regionId={deleteTarget.regionId}
          childIds={deleteTarget.childIds}
          parentId={deleteTarget.parentId}
          onConfirm={a.handleConfirmDeleteManual}
          onClose={a.closeDelete}
        />
      )}
      {showMetrics && scheme && (
        <MetricsPanel
          metrics={scheme.metrics}
          onClose={a.closeMetrics}
          onSelectRegion={(id) => {
            a.closeMetrics();
            a.openRegionDetails(id);
          }}
        />
      )}
      {showLegend && (
        <LegendPanel onClose={a.closeLegend} />
      )}
      {showSearch && scheme && (
        <SearchPanel
          regionIds={regionIdList}
          parentMap={parentMap}
          onClose={a.closeSearch}
          onSelect={a.focusRegion}
        />
      )}
      {showFlagTreeDialog && scheme && (
        <FlagTreeDialog
          scheme={scheme}
          flagsCatalog={flagsCatalog}
          onClose={a.closeFlagTree}
          onHighlightFlag={(name) => {
            a.applyHighlightFlag(name);
            a.closeFlagTree();
          }}
        />
      )}
      {showFlagsManager && scheme && (
        <FlagsManagerDialog
          key={`${flagsManagerFocusId ?? ''}|${flagsManagerFilterFlag ?? ''}|flags-manager`}
          scheme={scheme}
          flagsCatalog={flagsCatalog}
          onClose={a.closeFlagsManager}
          onSave={a.handleUpdateFlags}
          onBulk={a.handleBulkFlags}
          onClearAllFlags={a.handleClearAllFlags}
          onOpenCatalog={a.openFlagsCatalog}
          initialRegionId={flagsManagerFocusId}
          initialFilterFlag={flagsManagerFilterFlag}
          onShowFlagOnScheme={(flagName) => {
            a.closeFlagsManager();
            a.applyHighlightFlag(flagName);
          }}
        />
      )}
      {showFlagsCatalog && (
        <FlagsCatalogDialog
          scheme={scheme}
          flagsCatalog={flagsCatalog}
          onClose={a.closeFlagsCatalog}
          onAdd={async (payload) => { await addCustomFlag(payload); a.setFlagsCatalog(await fetchFlags()); }}
          onDelete={async (name) => {
            await deleteCustomFlag(name);
            a.setFlagsCatalog(await fetchFlags());
            a.setScheme((current) => current ? {
              ...current,
              regions: current.regions.map((region) => {
                const flags = { ...region.flags };
                delete flags[name];
                return { ...region, flags };
              }),
            } : current);
          }}
          onDeleteAll={async () => {
            await deleteAllCustomFlags();
            a.setFlagsCatalog(await fetchFlags());
            a.setScheme((current) => current ? {
              ...current,
              regions: current.regions.map((region) => {
                const flags = { ...region.flags };
                flagsCatalog.filter((flag) => flag.builtin === false).forEach((flag) => delete flags[flag.name]);
                return { ...region, flags };
              }),
            } : current);
          }}
          onImport={async (file) => { await importCustomFlags(file); a.setFlagsCatalog(await fetchFlags()); }}
          onExport={async () => downloadText(await exportCustomFlags(), 'custom_flags.json')}
        />
      )}
      {showAddDialog && (
        <AddRegionDialog
          key={addDialogInitialParent ?? 'free'}
          regionIds={regionIdList}
          flagsCatalog={flagsCatalog}
          initialParent={addDialogInitialParent}
          onAdd={a.handleAddManual}
          onClose={a.closeAddDialog}
          onShowFlagOnScheme={(flagName) => {
            a.closeAddDialog();
            a.applyHighlightFlag(flagName);
          }}
        />
      )}
      {renameTargetId && (
        <RenameRegionDialog
          regionId={renameTargetId}
          onRename={a.handleRename}
          onClose={a.closeRename}
        />
      )}

      {showFlagConflictsDialog && scheme && flagConflicts && (
        <FlagConflictsDialog
          result={flagConflicts}
          flagsCatalog={flagsCatalog}
          onClose={a.closeFlagConflicts}
          onFocusRegion={(id) => {
            a.focusRegion(id);
          }}
          onShowSpatialOnScheme={a.showConflictOnScheme}
          onShowOverwriteOnScheme={a.showOverwriteOnScheme}
        />
      )}

      {notificationToasts.length > 0 && (
        <div className="notification-toasts" aria-live="polite">
          <div className="notification-toasts-header">
            <button
              type="button"
              className="notification-toasts-dismiss-all"
              title={t('notifications.dismissToasts')}
              aria-label={t('notifications.dismissToasts')}
              onClick={a.dismissAllToasts}
            >
              ×
            </button>
          </div>
          {notificationToasts.map((toast) => (
            <div
              key={toast.id}
              className={`notification-toast notification-toast--${toast.level}${toast.kind === 'info' || toast.kind === 'update' ? ' notification-toast--info' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => {
                const sel = window.getSelection();
                if (sel && sel.toString().trim()) return;
                a.openNotificationOnScheme(toast);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  a.openNotificationOnScheme(toast);
                }
              }}
            >
              <span className="notification-toast-level">
                {toast.kind === 'info' || toast.kind === 'update'
                  ? t('notifications.tabInfo')
                  : toast.level === 'error'
                    ? t('notifications.tabErrors')
                    : t('notifications.tabWarnings')}
              </span>
              <strong>{t(toast.titleKey, toast.params)}</strong>
              <span>{t(toast.bodyKey, toast.params)}</span>
              {toast.detail ? (
                <span className="notification-toast-detail">{toast.detail}</span>
              ) : null}
              {toast.kind === 'update' ? (
                <span className="notification-toast-hint">{t('notifications.updateHint')}</span>
              ) : toast.kind !== 'info' ? (
                <span className="notification-toast-hint">{t('notifications.toastHint')}</span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// Keep RegionData import used for typing consumers
export type { RegionData };
