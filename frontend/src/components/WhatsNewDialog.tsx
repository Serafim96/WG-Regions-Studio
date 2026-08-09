import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/I18nContext';
import { ModalOverlay } from './ModalOverlay';

interface WhatsNewDialogProps {
  version: string;
  highlights: string[];
  onClose: () => void;
}

/** Compact first-launch changelog for the running build. */
export function WhatsNewDialog({ version, highlights, onClose }: WhatsNewDialogProps) {
  const { t } = useI18n();
  return createPortal(
    <ModalOverlay className="confirm-dialog-overlay" onClose={onClose}>
      <div
        className="modal clear-scheme-modal whats-new-modal"
        role="dialog"
        aria-labelledby="whats-new-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2 id="whats-new-title">{t('whatsNew.title', { version })}</h2>
          <button type="button" onClick={onClose} aria-label={t('whatsNew.close')}>
            ×
          </button>
        </header>
        <div className="modal-body">
          {highlights.length > 0 ? (
            <ul className="whats-new-list">
              {highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="whats-new-empty">{t('whatsNew.empty')}</p>
          )}
          <div className="modal-actions">
            <button type="button" className="primary" onClick={onClose}>
              {t('whatsNew.ok')}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>,
    document.body,
  );
}
