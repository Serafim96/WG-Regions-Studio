import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/I18nContext';
import type { SpatialConflict } from '../../utils/flagConflicts';

type Props = {
  conflicts: SpatialConflict[];
  onShow: (conflict: SpatialConflict) => void;
  size?: 'sm' | 'md';
};

interface DropdownBox {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export function ConflictBadge({ conflicts, onShow, size = 'sm' }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<DropdownBox | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const portalRef = useRef<HTMLUListElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useLayoutEffect(() => {
    if (!open) {
      setBox(null);
      return;
    }
    const anchor = btnRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const gap = 4;
    const width = Math.min(280, window.innerWidth - 16);
    let left = rect.left;
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
    setBox({ top: rect.bottom + gap, left, width, maxHeight: 200 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || portalRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = t('region.showConflictOnScheme');

  if (conflicts.length === 0) return null;

  const onClick = () => {
    if (conflicts.length === 1) {
      onShow(conflicts[0]);
      return;
    }
    setOpen((v) => !v);
  };

  return (
    <span className={`region-conflict-badge-wrap region-conflict-badge-wrap--${size}`} ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        className="region-conflict-badge"
        title={label}
        aria-label={label}
        onClick={onClick}
      >
        !
      </button>
      {open && box && conflicts.length > 1 && createPortal(
        <ul
          ref={portalRef}
          id={listId}
          className="region-conflict-badge-menu"
          style={{
            position: 'fixed',
            top: box.top,
            left: box.left,
            width: box.width,
            maxHeight: box.maxHeight,
            zIndex: 10000,
          }}
        >
          {conflicts.map((c) => (
            <li key={`${c.aId}-${c.bId}-${c.flagName}`}>
              <button type="button" onClick={() => { setOpen(false); onShow(c); }}>
                {c.aId} ↔ {c.bId}
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </span>
  );
}
