import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/I18nContext';
import { IconLock, IconUnlock } from '../GraphControlIcons';

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
    </svg>
  );
}

export type RegionPanelHeaderProps = {
  regionId: string;
  canGoBack: boolean;
  canGoForward: boolean;
  fieldsLocked: boolean;
  saveBusy: boolean;
  isDirty: boolean;
  copiedFlashPos: { left: number; top: number } | null;
  showCopiedFlash: boolean;
  copyBtnRef: React.RefObject<HTMLButtonElement | null>;
  onHistoryBack: () => void;
  onHistoryForward: () => void;
  onRequestRename?: (regionId: string) => void;
  onCopyName: () => void;
  onToggleLock: () => void;
  onDiscard: () => void;
  onSave: () => void;
  onClose: () => void;
};

export function RegionPanelHeader({
  regionId,
  canGoBack,
  canGoForward,
  fieldsLocked,
  saveBusy,
  isDirty,
  copiedFlashPos,
  showCopiedFlash,
  copyBtnRef,
  onHistoryBack,
  onHistoryForward,
  onRequestRename,
  onCopyName,
  onToggleLock,
  onDiscard,
  onSave,
  onClose,
}: RegionPanelHeaderProps) {
  const { t } = useI18n();

  return (
    <header className="region-panel-header">
      <div className="region-panel-title">
        <div className="region-history-nav">
          <button
            type="button"
            className="icon-btn"
            disabled={!canGoBack}
            title={t('region.historyBack')}
            aria-label={t('region.historyBack')}
            onClick={onHistoryBack}
          >
            ←
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled={!canGoForward}
            title={t('region.historyForward')}
            aria-label={t('region.historyForward')}
            onClick={onHistoryForward}
          >
            →
          </button>
        </div>
        <h2>{regionId}</h2>
        {onRequestRename && (
          <button type="button" onClick={() => onRequestRename(regionId)}>
            {t('region.editName')}
          </button>
        )}
        <span className="copy-name-wrap">
          <button
            ref={copyBtnRef as React.Ref<HTMLButtonElement>}
            type="button"
            className="icon-btn"
            title={t('region.copyName')}
            aria-label={t('region.copyName')}
            onClick={onCopyName}
          >
            <CopyIcon />
          </button>
        </span>
        {showCopiedFlash && copiedFlashPos && createPortal(
          <span
            className="copy-name-flash"
            role="status"
            style={{ left: copiedFlashPos.left, top: copiedFlashPos.top }}
          >
            {t('region.copiedFlash')}
          </span>,
          document.body,
        )}
        <button
          type="button"
          className={`icon-btn region-fields-lock${fieldsLocked ? ' is-locked' : ' is-unlocked'}`}
          title={t(fieldsLocked ? 'region.unlockFields' : 'region.lockFields')}
          aria-label={t(fieldsLocked ? 'region.unlockFields' : 'region.lockFields')}
          disabled={saveBusy}
          onClick={onToggleLock}
        >
          {fieldsLocked ? <IconLock /> : <IconUnlock />}
        </button>
      </div>
      <div className="region-panel-header-actions">
        <button
          type="button"
          className="region-action-btn"
          disabled={!isDirty || saveBusy}
          onClick={onDiscard}
        >
          {t('region.cancelChanges')}
        </button>
        <button
          type="button"
          className="region-action-btn success"
          disabled={!isDirty || saveBusy}
          onClick={onSave}
        >
          {saveBusy ? t('region.savingAll') : t('region.saveAll')}
        </button>
        <button type="button" onClick={onClose}>×</button>
      </div>
    </header>
  );
}
