import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/I18nContext';
import { compareNatural } from '../../utils/naturalSort';

interface DropdownBox {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  ariaLabel: string;
  placeholder?: string;
};

/** Filter input with substring suggestions in a portal (not clipped by table scroll). */
export function RegionFilterInput({
  value,
  onChange,
  suggestions,
  ariaLabel,
  placeholder,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [box, setBox] = useState<DropdownBox | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const unique = [...new Set(suggestions)].sort(compareNatural);
    if (!q) return unique.slice(0, 40);
    return unique.filter((id) => id.toLowerCase().includes(q)).slice(0, 40);
  }, [suggestions, value]);

  useEffect(() => {
    setActiveIndex(0);
  }, [value, open, filtered.length]);

  useLayoutEffect(() => {
    if (!open) {
      setBox(null);
      return;
    }
    const update = () => {
      const anchor = inputWrapRef.current;
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
  }, [open, filtered.length, value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  const dropdown = open && box && filtered.length > 0
    ? createPortal(
        <ul
          id={listId}
          ref={listRef}
          className="flag-name-suggestions flag-name-suggestions--portal region-filter-suggestions"
          role="listbox"
          style={{
            top: box.top,
            left: box.left,
            width: box.width,
            maxHeight: box.maxHeight,
          }}
        >
          {filtered.map((id, index) => (
            <li key={id}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={index === activeIndex ? 'active' : ''}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(id)}
              >
                <span className="flag-suggestion-name">{id}</span>
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )
    : null;

  return (
    <div className="region-filter-input" ref={rootRef}>
      <div ref={inputWrapRef}>
        <input
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className="search-input region-effective-filter"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? t('region.columnFilter')}
          aria-label={ariaLabel}
          onKeyDown={(e) => {
            if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              setOpen(true);
              return;
            }
            if (!open) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter' && filtered[activeIndex]) {
              e.preventDefault();
              pick(filtered[activeIndex]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
      </div>
      {dropdown}
    </div>
  );
}
