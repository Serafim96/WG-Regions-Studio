import { useEffect, useState } from 'react';
import { fetchAppVersion, type AppVersionInfo } from '../api';
import { useI18n } from '../i18n/I18nContext';
import { markWhatsNewSeen, shouldShowWhatsNew } from '../utils/whatsNew';
import { WhatsNewDialog } from '../components/WhatsNewDialog';

/**
 * Show a one-time What's New dialog when the running build differs from the
 * last acknowledged version in localStorage.
 */
export function useWhatsNewDialog() {
  const { locale } = useI18n();
  const [info, setInfo] = useState<AppVersionInfo | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      const ver = await fetchAppVersion(ctrl.signal);
      if (ctrl.signal.aborted || !ver?.version) return;
      setInfo(ver);
      if (shouldShowWhatsNew(ver.version)) {
        setOpen(true);
      }
    })();
    return () => ctrl.abort();
  }, []);

  const close = () => {
    if (info?.version) markWhatsNewSeen(info.version);
    setOpen(false);
  };

  const highlights =
    info?.highlights?.[locale]?.filter((s) => typeof s === 'string' && s.trim()) ??
    info?.highlights?.en?.filter((s) => typeof s === 'string' && s.trim()) ??
    [];

  const dialog =
    open && info ? (
      <WhatsNewDialog version={info.version} highlights={highlights} onClose={close} />
    ) : null;

  return { dialog };
}
