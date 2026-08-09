import appIcon from '../assets/app-icon.png';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeContext';

export type AppSidebarProps = {
  sidebarWidth: number;
  beginResize: (startX: number, startWidth: number) => void;
  status: string;
  busyMessage: string | null;
  hasScheme: boolean;
  schemeActionsDisabled: boolean;
  emptySchemeChrome: boolean;
  collapseThreshold: number;
  setCollapseThreshold: (n: number) => void;
  flagsCatalogEmpty: boolean;
  onOpenFile: () => void;
  onSaveScheme: () => void;
  onExportYaml: () => void;
  onOpenFlagsManager: () => void;
  onOpenFlagsCatalog: () => void;
  onOpenFlagConflicts: () => void;
  onOpenMetrics: () => void;
  onResetScheme: () => void;
  onClearScheme: () => void;
};

export function AppSidebar({
  sidebarWidth,
  beginResize,
  status,
  busyMessage,
  hasScheme,
  schemeActionsDisabled,
  emptySchemeChrome,
  collapseThreshold,
  setCollapseThreshold,
  flagsCatalogEmpty,
  onOpenFile,
  onSaveScheme,
  onExportYaml,
  onOpenFlagsManager,
  onOpenFlagsCatalog,
  onOpenFlagConflicts,
  onOpenMetrics,
  onResetScheme,
  onClearScheme,
}: AppSidebarProps) {
  const { t, locale, setLocale } = useI18n();
  const { theme, toggleTheme } = useTheme();

  return (
    <aside
      className="toolbar"
      style={{ width: sidebarWidth, flexBasis: sidebarWidth }}
    >
      <div
        className="sidebar-resize-handle"
        title={t('app.resizeSidebar')}
        onMouseDown={(e) => {
          e.preventDefault();
          beginResize(e.clientX, sidebarWidth);
        }}
      />
      <div className="app-brand">
        <img className="app-brand-icon" src={appIcon} alt="" width={28} height={28} />
        <h1>{t('app.title')}</h1>
      </div>

      <div className="preferences-row">
        <div className="lang-switch">
          <span className="lang-switch-label">{t('app.language')}:</span>
          <button
            type="button"
            className={locale === 'ru' ? 'lang-btn active' : 'lang-btn'}
            onClick={() => setLocale('ru')}
          >
            RU
          </button>
          <button
            type="button"
            className={locale === 'en' ? 'lang-btn active' : 'lang-btn'}
            onClick={() => setLocale('en')}
          >
            EN
          </button>
        </div>
        <button
          type="button"
          className="theme-toggle"
          onClick={toggleTheme}
          title={theme === 'light' ? t('app.themeToDark') : t('app.themeToLight')}
          aria-label={theme === 'light' ? t('app.themeToDark') : t('app.themeToLight')}
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>

      <section className="toolbar-section">
        <button
          type="button"
          className={emptySchemeChrome ? 'primary' : undefined}
          onClick={onOpenFile}
          disabled={Boolean(busyMessage)}
        >
          <span aria-hidden>📂 </span>{t('app.openFile')}
        </button>
        <button type="button" className="success" onClick={onSaveScheme} disabled={!hasScheme || Boolean(busyMessage)}>
          <span aria-hidden>💾 </span>{t('app.saveScheme')}
        </button>
        <button
          type="button"
          onClick={onExportYaml}
          disabled={schemeActionsDisabled || flagsCatalogEmpty}
        >
          <span aria-hidden>⇩ </span>{t('app.exportRegionsYml')}
        </button>
      </section>
      <section className="toolbar-section">
        <button type="button" onClick={onOpenFlagsManager} disabled={schemeActionsDisabled}>
          <span aria-hidden>⚑ </span>{t('app.flagsManager')}
        </button>
        <button type="button" onClick={onOpenFlagsCatalog} disabled={schemeActionsDisabled}>
          <span aria-hidden>☷ </span>{t('app.flagsCatalog')}
        </button>
        <button
          type="button"
          onClick={onOpenFlagConflicts}
          disabled={schemeActionsDisabled || flagsCatalogEmpty}
        >
          <span aria-hidden>⚠ </span>{t('app.analyzeFlagConflicts')}
        </button>
      </section>
      <section className="toolbar-section">
        <button type="button" onClick={onOpenMetrics} disabled={schemeActionsDisabled}>
          <span aria-hidden>📊 </span>{t('app.metrics')}
        </button>
      </section>

      <div className="settings-block">
        <p className="depth-scale-title">{t('app.autoCollapse')}</p>
        <p className="depth-scale-hint">{t('app.autoCollapseHint')}</p>
        <label className="threshold-control">
          <span className="threshold-control-label">
            {t('app.threshold')}:
            <input
              type="number"
              className="threshold-number"
              min={0}
              max={200}
              step={1}
              value={collapseThreshold}
              disabled={schemeActionsDisabled}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw.trim() === '') return;
                const n = Number(raw);
                if (!Number.isFinite(n)) return;
                setCollapseThreshold(Math.max(0, Math.min(200, Math.round(n))));
              }}
            />
          </span>
          <input
            type="range"
            min={0}
            max={200}
            step={1}
            value={collapseThreshold}
            disabled={schemeActionsDisabled}
            onChange={(e) => setCollapseThreshold(Number(e.target.value))}
          />
        </label>
      </div>

      <p className="status">{status}</p>
      <div className="sidebar-footer">
        <button
          type="button"
          className="warning"
          onClick={onResetScheme}
          disabled={schemeActionsDisabled}
        >
          <span aria-hidden>⟳ </span>{t('app.updateScheme')}
        </button>
        <button
          type="button"
          className="danger"
          onClick={onClearScheme}
          disabled={schemeActionsDisabled}
        >
          {t('app.clearScheme')}
        </button>
      </div>
    </aside>
  );
}
