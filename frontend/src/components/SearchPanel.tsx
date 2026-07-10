import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';

interface SearchPanelProps {
  regionIds: string[];
  onClose: () => void;
  onSelect: (regionId: string) => void;
}

export function SearchPanel({ regionIds, onClose, onSelect }: SearchPanelProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return regionIds.filter((id) => id.toLowerCase().includes(q)).slice(0, 50);
  }, [query, regionIds]);

  const submit = () => {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const exact = regionIds.filter((id) => id.toLowerCase() === q);
    const list = exact.length > 0 ? exact : matches;
    if (list.length === 1) {
      onSelect(list[0]);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal search-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('search.title')}</h2>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="modal-body">
          <input
            className="search-input"
            type="text"
            placeholder={t('search.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          {query.trim() && matches.length === 0 && (
            <p className="search-empty">{t('search.empty')}</p>
          )}
          {matches.length > 1 && (
            <ul className="search-results">
              {matches.map((id) => (
                <li key={id}>
                  <button type="button" onClick={() => { onSelect(id); onClose(); }}>{id}</button>
                </li>
              ))}
            </ul>
          )}
          {matches.length === 1 && query.trim() && (
            <p className="search-hint">{t('search.hint', { name: matches[0] })}</p>
          )}
        </div>
      </div>
    </div>
  );
}
