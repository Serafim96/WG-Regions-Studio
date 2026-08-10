import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAppVersion, type AppVersionInfo, type ChangelogRelease } from '../api';
import { useI18n } from '../i18n/I18nContext';
import { markWhatsNewSeen, shouldShowWhatsNew } from '../utils/whatsNew';
import { WhatsNewDialog } from '../components/WhatsNewDialog';

/**
 * Release-history dialog (offline):
 * - Auto-open on first launch of this local build (APP_VERSION + frontend bundle id in localStorage).
 * - Does **not** use GitHub / update checks — only local `/api/version` + browser storage.
 * - Manual open anytime via openChangelog().
 */
export function useWhatsNewDialog() {
  const { locale } = useI18n();
  const [info, setInfo] = useState<AppVersionInfo | null>(null);
  const [open, setOpen] = useState(false);
  const autoOpenedRef = useRef(false);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      const ver = await fetchAppVersion(ctrl.signal);
      if (ctrl.signal.aborted || !ver?.version) return;
      setInfo(ver);
      if (shouldShowWhatsNew(ver.version, ver.frontend_bundle)) {
        autoOpenedRef.current = true;
        setOpen(true);
      }
    })();
    return () => ctrl.abort();
  }, []);

  const openChangelog = useCallback(() => {
    autoOpenedRef.current = false;
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    if (autoOpenedRef.current && info?.version) {
      markWhatsNewSeen(info.version, info.frontend_bundle);
    }
    autoOpenedRef.current = false;
    setOpen(false);
  }, [info?.version, info?.frontend_bundle]);

  const releases: ChangelogRelease[] =
    info?.changelog?.[locale]?.filter((r) => r?.version && r.sections?.length) ??
    info?.changelog?.en?.filter((r) => r?.version && r.sections?.length) ??
    [];

  const dialog =
    open && info ? (
      <WhatsNewDialog version={info.version} releases={releases} onClose={close} />
    ) : null;

  return { dialog, openChangelog };
}
