import { useI18n } from '../i18n/I18nContext';
import type { SchemeIssue } from '../utils/schemeValidation';
import { ModalOverlay } from './ModalOverlay';

interface ValidationResultDialogProps {
  title: string;
  intro?: string;
  issues: SchemeIssue[];
  /** When there are no issues. */
  okMessage?: string;
  onClose: () => void;
}

/** Scrollable list of scheme validation / export-blocking issues. */
export function ValidationResultDialog({
  title,
  intro,
  issues,
  okMessage,
  onClose,
}: ValidationResultDialogProps) {
  const { t } = useI18n();
  const hasIssues = issues.length > 0;

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal validation-result-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="modal-body">
          {intro && <p>{intro}</p>}
          {!hasIssues ? (
            <p className="validation-ok">{okMessage ?? t('validate.ok')}</p>
          ) : (
            <ul className="validation-issue-list">
              {issues.map((issue, i) => (
                <li
                  key={`${issue.code}-${i}-${issue.regionIds?.join('-') ?? ''}`}
                  className={issue.severity === 'error' ? 'validation-issue-error' : 'validation-issue-warn'}
                >
                  {issue.text}
                </li>
              ))}
            </ul>
          )}
          <div className="modal-actions">
            <button type="button" className="primary" onClick={onClose}>
              {t('app.ok')}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
