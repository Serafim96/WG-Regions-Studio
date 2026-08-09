import { useEffect, useState } from 'react';
import { checkHealth } from '../api';

/** Poll backend liveness and expose server-down state for the overlay. */
export function useServerHealth(pollMs = 2000): boolean {
  const [serverDown, setServerDown] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let wasDown = false;

    const ping = async () => {
      const ctrl = new AbortController();
      const timeoutId = window.setTimeout(() => ctrl.abort(), 2500);
      try {
        const ok = await checkHealth(ctrl.signal);
        if (cancelled) return;
        const down = !ok;
        if (wasDown && !down) {
          try {
            window.focus();
          } catch {
            /* ignore */
          }
        }
        wasDown = down;
        setServerDown(down);
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    void ping();
    const intervalId = window.setInterval(() => {
      void ping();
    }, pollMs);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void ping();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [pollMs]);

  useEffect(() => {
    if (!serverDown) return;
    const blockKeys = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', blockKeys, true);
    window.addEventListener('keyup', blockKeys, true);
    window.addEventListener('keypress', blockKeys, true);
    return () => {
      window.removeEventListener('keydown', blockKeys, true);
      window.removeEventListener('keyup', blockKeys, true);
      window.removeEventListener('keypress', blockKeys, true);
    };
  }, [serverDown]);

  return serverDown;
}
