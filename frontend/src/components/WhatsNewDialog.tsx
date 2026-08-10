import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/I18nContext';
import type { ChangelogRelease } from '../api';
import { IconChangelog } from './GraphControlIcons';
import { ModalOverlay } from './ModalOverlay';

interface WhatsNewDialogProps {
  version: string;
  releases: ChangelogRelease[];
  onClose: () => void;
}

/** Scrollable release history (newest first) on first launch of a new build. */
export function WhatsNewDialog({ version, releases, onClose }: WhatsNewDialogProps) {
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
          <h2 id="whats-new-title" className="whats-new-title">
            <IconChangelog size={22} className="whats-new-title-icon" />
            <span>{t('whatsNew.title')}</span>
          </h2>
          <button type="button" onClick={onClose} aria-label={t('whatsNew.close')}>
            ×
          </button>
        </header>
        <div className="modal-body whats-new-body">
          <p className="whats-new-running">{t('whatsNew.running', { version })}</p>
          {releases.length > 0 ? (
            <div className="whats-new-scroll">
              {releases.map((rel) => (
                <section key={rel.version} className="whats-new-release">
                  <h3 className="whats-new-release-head">
                    <span className="whats-new-version">{rel.version}</span>
                    {rel.date ? (
                      <time className="whats-new-date" dateTime={rel.date}>
                        {rel.date}
                      </time>
                    ) : null}
                  </h3>
                  {rel.subtitle ? <p className="whats-new-subtitle">{rel.subtitle}</p> : null}
                  {rel.sections.map((section) => (
                    <div key={`${rel.version}-${section.title || 'body'}`} className="whats-new-section">
                      {section.title ? <h4 className="whats-new-section-title">{section.title}</h4> : null}
                      <ul className="whats-new-list">
                        {section.items.map((item, idx) => (
                          <li key={`${rel.version}-${section.title}-${idx}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              ))}
            </div>
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
