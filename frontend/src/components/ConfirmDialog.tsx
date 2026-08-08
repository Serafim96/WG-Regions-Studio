import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/I18nContext';
import { ModalOverlay } from './ModalOverlay';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** CSS class for the confirm button (default: danger). */
  confirmClass?: 'danger' | 'primary' | 'success' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
  /** Overlay / × close. Defaults to onCancel. */
  onDismiss?: () => void;
}

/** App-styled yes/no dialog (replaces window.confirm). Always on top via portal. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  confirmClass = 'danger',
  onConfirm,
  onCancel,
  onDismiss,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const dismiss = onDismiss ?? onCancel;
  return createPortal(
    <ModalOverlay className="confirm-dialog-overlay" onClose={dismiss}>
      <div className="modal clear-scheme-modal confirm-dialog-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button type="button" onClick={dismiss}>×</button>
        </header>
        <div className="modal-body">
          <p>{message}</p>
          <div className="modal-actions">
            <button type="button" className="primary" onClick={onCancel}>
              {cancelLabel ?? t('app.no')}
            </button>
            <button type="button" className={confirmClass} onClick={onConfirm}>
              {confirmLabel ?? t('app.yes')}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>,
    document.body,
  );
}
