import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { compareNatural } from '../utils/naturalSort';
import { ModalOverlay } from './ModalOverlay';
import { SuggestDropdown } from './SuggestDropdown';

interface SearchPanelProps {
  regionIds: string[];
  onClose: () => void;
  onSelect: (regionId: string) => void;
  /** When provided, show ancestor path for the highlighted match. */
  parentMap?: Map<string, string | null>;
}

function buildPath(regionId: string, parentMap: Map<string, string | null>): string[] {
  const chain: string[] = [];
  let current: string | null | undefined = regionId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = parentMap.get(current) ?? null;
  }
  return chain.reverse();
}

export function SearchPanel({ regionIds, onClose, onSelect, parentMap }: SearchPanelProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...regionIds].sort(compareNatural);
    if (!q) return sorted.slice(0, 80);
    return sorted.filter((id) => id.toLowerCase().includes(q)).slice(0, 50);
  }, [query, regionIds]);

  const pathPreview = useMemo(() => {
    if (!parentMap || matches.length === 0) return null;
    const q = query.trim().toLowerCase();
    const exact = q ? matches.find((id) => id.toLowerCase() === q) : undefined;
    const id = exact ?? (matches.length === 1 ? matches[0] : null);
    if (!id) return null;
    return buildPath(id, parentMap);
  }, [parentMap, matches, query]);

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
    <ModalOverlay onClose={onClose}>
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
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <SuggestDropdown
            items={matches}
            query={query}
            open={showSuggestions}
            onPick={(id) => {
              onSelect(id);
              onClose();
            }}
          />
          {pathPreview && pathPreview.length > 0 && (
            <p className="search-path" title={pathPreview.join(' / ')}>
              {t('search.path')}: {pathPreview.join(' → ')}
            </p>
          )}
          {matches.length === 1 && query.trim() && (
            <p className="search-hint">{t('search.hint', { name: matches[0] })}</p>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
