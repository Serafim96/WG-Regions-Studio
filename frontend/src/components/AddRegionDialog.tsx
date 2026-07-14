import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';

interface AddRegionDialogProps {
  regionIds: string[];
  lockedParent?: string;
  onAdd: (data: {
    id: string;
    parent: string | null;
    priority: number;
    flags: Record<string, string>;
    isGlobal: boolean;
  }) => void;
  onClose: () => void;
}

function resolveParentQuery(query: string, regionIds: string[]): string | null {
  const q = query.trim();
  if (!q) return null;
  return regionIds.find((id) => id.toLowerCase() === q.toLowerCase()) ?? null;
}

export function AddRegionDialog({ regionIds, lockedParent, onAdd, onClose }: AddRegionDialogProps) {
  const { t } = useI18n();
  const [id, setId] = useState('');
  const [parentQuery, setParentQuery] = useState('');
  const [priority, setPriority] = useState(0);
  const [isGlobal, setIsGlobal] = useState(false);
  const [flagsText, setFlagsText] = useState('');
  const [showFlagsExample, setShowFlagsExample] = useState(false);
  const [showParentSuggestions, setShowParentSuggestions] = useState(false);

  const parentMatches = useMemo(() => {
    const q = parentQuery.trim().toLowerCase();
    if (!q) return [];
    return regionIds.filter((regionId) => regionId.toLowerCase().includes(q)).slice(0, 50);
  }, [parentQuery, regionIds]);

  const resolvedParent = lockedParent ?? resolveParentQuery(parentQuery, regionIds);
  const parentInputInvalid =
    lockedParent === undefined &&
    parentQuery.trim() !== '' &&
    resolvedParent === null;

  const canSubmit = id.trim() !== '' && !parentInputInvalid;

  const parseFlags = (): Record<string, string> => {
    const flags: Record<string, string> = {};
    for (const line of flagsText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes('=')) continue;
      const [k, ...rest] = trimmed.split('=');
      flags[k.trim()] = rest.join('=').trim();
    }
    return flags;
  };

  const pickParent = (regionId: string) => {
    setParentQuery(regionId);
    setShowParentSuggestions(false);
  };

  const handleParentChange = (value: string) => {
    setParentQuery(value);
    setShowParentSuggestions(true);
  };

  const handleParentFocus = () => {
    if (parentQuery.trim()) {
      setShowParentSuggestions(true);
    }
  };

  const submit = () => {
    if (!canSubmit) return;
    onAdd({
      id: id.trim(),
      parent: resolvedParent,
      priority,
      flags: parseFlags(),
      isGlobal,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{lockedParent ? t('addRegion.titleDescendant') : t('addRegion.title')}</h2>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="modal-body form-grid">
          <label>
            ID
            <input value={id} onChange={(e) => setId(e.target.value)} autoFocus />
          </label>
          <label>
            {t('addRegion.parent')}
            {lockedParent !== undefined ? (
              <input value={lockedParent} readOnly className="readonly-input" />
            ) : (
              <>
                <input
                  className="search-input"
                  type="text"
                  placeholder={t('addRegion.parentPlaceholder')}
                  value={parentQuery}
                  onChange={(e) => handleParentChange(e.target.value)}
                  onFocus={handleParentFocus}
                />
                {showParentSuggestions && parentQuery.trim() && parentMatches.length === 0 && (
                  <p className="search-empty">{t('search.empty')}</p>
                )}
                {showParentSuggestions && parentInputInvalid && (
                  <p className="search-empty">{t('addRegion.parentInvalid')}</p>
                )}
                {showParentSuggestions && parentMatches.length > 1 && (
                  <ul className="search-results">
                    {parentMatches.map((regionId) => (
                      <li key={regionId}>
                        <button type="button" onClick={() => pickParent(regionId)}>
                          {regionId}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!parentQuery.trim() && (
                  <p className="hint">{t('addRegion.rootOption')}</p>
                )}
              </>
            )}
          </label>
          <label>
            {t('addRegion.priority')}
            <input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={isGlobal}
              onChange={(e) => setIsGlobal(e.target.checked)}
            />
            {t('addRegion.global')}
          </label>
          <p className="hint">{t('addRegion.globalHint')}</p>
          <label>
            {t('addRegion.flags')}
            <textarea rows={4} value={flagsText} onChange={(e) => setFlagsText(e.target.value)} />
            <button
              type="button"
              className="inline-toggle-btn"
              onClick={() => setShowFlagsExample((open) => !open)}
            >
              {showFlagsExample ? t('addRegion.hideFlagsExample') : t('addRegion.showFlagsExample')}
            </button>
            {showFlagsExample && (
              <pre className="flags-example">{t('addRegion.flagsExample')}</pre>
            )}
          </label>
          <button type="button" className="primary" onClick={submit} disabled={!canSubmit}>
            {t('addRegion.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
