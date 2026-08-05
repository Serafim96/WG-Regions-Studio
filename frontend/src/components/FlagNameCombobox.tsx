import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/I18nContext';
import type { FlagInfo } from '../types';
import { FlagHelpButton, findFlagInfo } from './FlagHelpButton';

interface FlagNameComboboxProps {
  value: string;
  flagsCatalog: FlagInfo[];
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
}

interface DropdownBox {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

/** Search input with filtered catalog suggestions; free-text custom names allowed. */
export function FlagNameCombobox({
  value,
  flagsCatalog,
  onChange,
  placeholder,
  id,
}: FlagNameComboboxProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [box, setBox] = useState<DropdownBox | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const known = findFlagInfo(flagsCatalog, value);

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = !q
      ? flagsCatalog
      : flagsCatalog.filter(
          (f) =>
            f.name.toLowerCase().includes(q)
            || f.type.toLowerCase().includes(q),
        );
    return list;
  }, [flagsCatalog, value]);

  useEffect(() => {
    setActiveIndex(0);
  }, [value, open]);

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
      const preferBelow = spaceBelow >= 180 || spaceBelow >= spaceAbove;
      const maxHeight = Math.max(160, Math.min(420, preferBelow ? spaceBelow : spaceAbove));
      const width = Math.min(Math.max(rect.width, 360), Math.min(window.innerWidth - 16, 520));
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
  }, [open, suggestions.length, value]);

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

  useEffect(() => {
    if (!open || !listRef.current) return;
    const active = listRef.current.querySelector<HTMLElement>('[aria-selected="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  const dropdown = open && box && suggestions.length > 0
    ? createPortal(
        <ul
          id={listId}
          ref={listRef}
          className="flag-name-suggestions flag-name-suggestions--portal"
          role="listbox"
          style={{
            top: box.top,
            left: box.left,
            width: box.width,
            maxHeight: box.maxHeight,
          }}
        >
          {suggestions.map((f, index) => (
            <li key={f.name}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={index === activeIndex ? 'active' : ''}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(f.name)}
              >
                <span className="flag-suggestion-name">{f.name}</span>
                <span className="flag-suggestion-type">{f.type}</span>
                {!f.builtin ? (
                  <span className="flag-suggestion-custom">{t('legend.flagsCustomBadge')}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )
    : null;

  const emptyHint = open && box && value.trim() && suggestions.length === 0
    ? createPortal(
        <p
          className="flag-name-suggestions-empty flag-name-suggestions-empty--portal"
          style={{ top: box.top, left: box.left, width: box.width }}
        >
          {t('flagsManager.flagNameCustomHint')}
        </p>,
        document.body,
      )
    : null;

  return (
    <div className="flag-name-combobox" ref={rootRef}>
      <div className="flag-name-edit-cell" ref={inputWrapRef}>
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          value={value}
          placeholder={placeholder ?? t('flagsManager.namePlaceholder')}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              setOpen(true);
              return;
            }
            if (!open) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, Math.max(suggestions.length - 1, 0)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter' && suggestions[activeIndex]) {
              e.preventDefault();
              pick(suggestions[activeIndex].name);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        {known ? <FlagHelpButton name={value} flagsCatalog={flagsCatalog} /> : null}
      </div>
      {dropdown}
      {emptyHint}
    </div>
  );
}
