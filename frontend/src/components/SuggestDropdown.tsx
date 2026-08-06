import { useI18n } from '../i18n/I18nContext';

interface SuggestDropdownProps {
  items: string[];
  query: string;
  open: boolean;
  onPick: (value: string) => void;
  emptyWhenQuery?: boolean;
}

/** Plain list-style suggestions (not button chrome). */
export function SuggestDropdown({
  items,
  query,
  open,
  onPick,
  emptyWhenQuery = true,
}: SuggestDropdownProps) {
  const { t } = useI18n();
  if (!open) return null;
  const q = query.trim();
  if (!q && items.length === 0) return null;
  if (q && items.length === 0 && emptyWhenQuery) {
    return <p className="search-empty">{t('search.empty')}</p>;
  }
  if (items.length === 0) return null;

  return (
    <ul className="suggest-dropdown" role="listbox">
      {items.map((id) => (
        <li key={id}>
          <button
            type="button"
            className="suggest-dropdown-item"
            role="option"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(id)}
          >
            {id}
          </button>
        </li>
      ))}
    </ul>
  );
}
