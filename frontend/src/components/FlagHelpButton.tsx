import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/I18nContext';
import type { FlagInfo } from '../types';

export function findFlagInfo(
  flagsCatalog: FlagInfo[],
  name: string,
): FlagInfo | undefined {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  return flagsCatalog.find((f) => f.name === trimmed);
}

interface FlagHelpButtonProps {
  name: string;
  flagsCatalog: FlagInfo[];
  /** Prefer absolute positioning (tables); use 'inline' inside narrow columns. */
  placement?: 'below' | 'inline';
}

/** Compact «?» control that opens a description popover for a WorldGuard flag. */
export function FlagHelpButton({
  name,
  flagsCatalog,
  placement = 'below',
}: FlagHelpButtonProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const info = findFlagInfo(flagsCatalog, name);
  const trimmed = name.trim();

  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setCoords(null);
      return;
    }
    const update = () => {
      const rect = rootRef.current!.getBoundingClientRect();
      const width = Math.min(340, window.innerWidth - 16);
      let left = rect.left;
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - width - 8);
      }
      let top = rect.bottom + 6;
      const approxHeight = 220;
      if (top + approxHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - approxHeight - 6);
      }
      setCoords({ top, left });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!trimmed) return null;
  // Only show help for flags present in the catalog.
  if (!info) return null;

  return (
    <span className={`flag-help flag-help--${placement}`} ref={rootRef}>
      <button
        type="button"
        className="flag-help-btn"
        aria-expanded={open}
        aria-controls={panelId}
        title={t('flagHelp.open')}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        ?
      </button>
      {open && coords
        ? createPortal(
            <div
              ref={popoverRef}
              id={panelId}
              className="flag-help-popover flag-help-popover--portal"
              role="dialog"
              aria-label={t('flagHelp.title', { name: trimmed })}
              style={{ top: coords.top, left: coords.left }}
              onClick={(e) => e.stopPropagation()}
            >
              <header className="flag-help-popover-header">
                <div>
                  <strong>{trimmed}</strong>
                  {info.type ? <span className="flag-help-type">{info.type}</span> : null}
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label={t('flagHelp.close')}>
                  ×
                </button>
              </header>
              <p className="flag-help-desc">
                {info.description?.trim()
                  ? info.description
                  : t('flagHelp.unknown')}
              </p>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

/** Flag name with an inline quick-help control. */
export function FlagNameWithHelp({
  name,
  flagsCatalog,
}: {
  name: string;
  flagsCatalog: FlagInfo[];
}) {
  return (
    <span className="flag-name-with-help">
      <code className="flag-name-code">{name}</code>
      <FlagHelpButton name={name} flagsCatalog={flagsCatalog} />
    </span>
  );
}
