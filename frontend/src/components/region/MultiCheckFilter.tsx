import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/I18nContext';

type Option = { value: string; label: string };

type Props = {
  options: Option[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  ariaLabel: string;
  allLabel: string;
};

interface DropdownBox {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export function MultiCheckFilter({
  options,
  selected,
  onChange,
  ariaLabel,
  allLabel,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<DropdownBox | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const triggerText = (() => {
    if (selected.size === 0 || selected.size === options.length) return allLabel;
    const labels = options.filter((o) => selected.has(o.value)).map((o) => o.label);
    const joined = labels.join(', ');
    return joined.length > 28 ? `${joined.slice(0, 25)}…` : joined;
  })();

  const fullTitle = selected.size === 0 || selected.size === options.length
    ? allLabel
    : options.filter((o) => selected.has(o.value)).map((o) => o.label).join(', ');

  useLayoutEffect(() => {
    if (!open) {
      setBox(null);
      return;
    }
    const update = () => {
      const anchor = triggerRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const gap = 4;
      const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
      const spaceAbove = rect.top - gap - 8;
      const preferBelow = spaceBelow >= 120 || spaceBelow >= spaceAbove;
      const maxHeight = Math.max(120, Math.min(320, preferBelow ? spaceBelow : spaceAbove));
      const width = Math.min(Math.max(rect.width, 200), Math.min(window.innerWidth - 16, 420));
      let left = rect.left;
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - width - 8);
      }
      const top = preferBelow
        ? rect.bottom + gap
        : Math.max(8, rect.top - gap - maxHeight);
      setBox({ top, left, width, maxHeight });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
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

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  return (
    <div className="region-multi-check-filter" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="region-effective-filter region-multi-check-trigger"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        title={fullTitle}
        onClick={() => setOpen((v) => !v)}
      >
        {triggerText}
      </button>
      {open && box && createPortal(
        <div
          ref={portalRef}
          id={listId}
          className="region-multi-check-dropdown"
          style={{
            position: 'fixed',
            top: box.top,
            left: box.left,
            width: box.width,
            maxHeight: box.maxHeight,
            zIndex: 10000,
          }}
          role="listbox"
        >
          {options.map((opt) => (
            <label key={opt.value} className="region-multi-check-option">
              <input
                type="checkbox"
                checked={selected.has(opt.value)}
                onChange={() => toggle(opt.value)}
              />
              {opt.label}
            </label>
          ))}
          <button
            type="button"
            className="region-multi-check-reset"
            onClick={() => onChange(new Set())}
          >
            {t('region.filterReset')}
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
