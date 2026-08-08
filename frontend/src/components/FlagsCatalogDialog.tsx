import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/I18nContext';
import type { FlagInfo, Scheme } from '../types';
import { ModalOverlay } from './ModalOverlay';

const FLAG_TYPES = [
  'state',
  'boolean',
  'string',
  'integer',
  'double',
  'location',
  'gamemode',
  'weather',
  'set of strings',
  'set of entity types',
];

interface Props {
  scheme: Scheme | null;
  flagsCatalog: FlagInfo[];
  onClose: () => void;
  onAdd: (payload: { name: string; type: string; description: string }) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
  onDeleteAll: () => Promise<void>;
  onImport: (file: File) => Promise<void>;
  onExport: () => Promise<void>;
}

export function FlagsCatalogDialog({
  scheme, flagsCatalog, onClose, onAdd, onDelete, onDeleteAll, onImport, onExport,
}: Props) {
  const { t } = useI18n();
  const importRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'standard' | 'custom'>('standard');
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState(FLAG_TYPES[0]);
  const [description, setDescription] = useState('');
  const [confirmNames, setConfirmNames] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const custom = useMemo(() => flagsCatalog.filter((flag) => flag.builtin === false), [flagsCatalog]);
  const visible = useMemo(() => {
    const source = tab === 'standard' ? flagsCatalog.filter((flag) => flag.builtin !== false) : custom;
    const needle = query.trim().toLowerCase();
    return needle
      ? source.filter((flag) => `${flag.name} ${flag.type} ${flag.description}`.toLowerCase().includes(needle))
      : source;
  }, [custom, flagsCatalog, query, tab]);
  const affectedIds = useMemo(() => {
    if (!confirmNames || !scheme) return [];
    const names = new Set(confirmNames);
    return scheme.regions.filter((region) => Object.keys(region.flags).some((flag) => names.has(flag))).map((r) => r.id);
  }, [confirmNames, scheme]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const add = () => run(async () => {
    await onAdd({ name: name.trim(), type, description });
    setName('');
    setType(FLAG_TYPES[0]);
    setDescription('');
    setTab('custom');
  });

  const confirmDelete = () => run(async () => {
    if (!confirmNames) return;
    if (confirmNames.length === 1) await onDelete(confirmNames[0]);
    else await onDeleteAll();
    setConfirmNames(null);
  });

  return (
    <>
      <ModalOverlay onClose={onClose}>
        <div className="modal flags-catalog-modal" onClick={(event) => event.stopPropagation()}>
          <header><h2>{t('catalog.title')}</h2><button type="button" onClick={onClose}>×</button></header>
          <div className="modal-body">
            <div className="legend-tabs">
              <button type="button" className={tab === 'standard' ? 'active' : ''} onClick={() => setTab('standard')}>{t('catalog.standardTab')}</button>
              <button type="button" className={tab === 'custom' ? 'active' : ''} onClick={() => setTab('custom')}>{t('catalog.customTab')}</button>
            </div>
            <label className="legend-flags-search"><span className="sr-only">{t('legend.flagsSearch')}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('legend.flagsSearch')} /></label>
            {tab === 'custom' && (
              <div className="legend-flags-add">
                <p className="legend-extra">{t('legend.flagsAddHint')}</p>
                <div className="legend-flags-add-row">
                  <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('flagsManager.namePlaceholder')} />
                  <select value={type} onChange={(event) => setType(event.target.value)}>
                    {FLAG_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t('region.flagDescription')} rows={2} />
                <div className="modal-actions">
                  <button type="button" onClick={add} disabled={busy || !name.trim()}>{t('legend.flagsAdd')}</button>
                  <button type="button" onClick={() => importRef.current?.click()} disabled={busy}>{t('catalog.import')}</button>
                  <button type="button" onClick={() => run(onExport)} disabled={busy}>{t('catalog.export')}</button>
                  <button type="button" className="danger" onClick={() => setConfirmNames(custom.map((flag) => flag.name))} disabled={busy || custom.length === 0}>{t('catalog.deleteAll')}</button>
                  <input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) run(async () => { await onImport(file); setTab('custom'); });
                    event.target.value = '';
                  }} />
                </div>
              </div>
            )}
            {error && <p className="flags-manager-error">{error}</p>}
            {visible.length === 0 ? <p className="legend-extra">{t('legend.flagsNoMatch')}</p> : (
              <div className="legend-flags-table-wrap"><table className="legend-table legend-flags-table"><thead><tr><th>{t('region.flagName')}</th><th>{t('region.flagType')}</th><th>{t('region.flagDescription')}</th><th /></tr></thead>
                <tbody>{visible.map((flag) => <tr key={flag.name}><td><code>{flag.name}</code></td><td>{flag.type}</td><td className="legend-flag-desc">{flag.description.trim() || t('flagHelp.unknown')}</td><td>{flag.builtin === false && <button type="button" className="flags-row-remove" title={t('legend.flagsDeleteCustom')} onClick={() => setConfirmNames([flag.name])}>×</button>}</td></tr>)}</tbody>
              </table></div>
            )}
          </div>
        </div>
      </ModalOverlay>
      {confirmNames && createPortal(
        <div className="modal-overlay confirm-dialog-overlay">
          <div className="modal catalog-confirm-modal" role="dialog" aria-modal="true">
            <header><h2>{t('catalog.deleteConfirmTitle')}</h2></header>
            <div className="modal-body">
              <p>{t('catalog.deleteConfirmText')}</p>
              {affectedIds.length > 0 && <p>{t('catalog.affectedRegions', { ids: affectedIds.slice(0, 30).join(', ') + (affectedIds.length > 30 ? '…' : '') })}</p>}
              <div className="modal-actions"><button type="button" onClick={() => setConfirmNames(null)}>{t('deleteManual.cancel')}</button><button type="button" className="danger" disabled={busy} onClick={confirmDelete}>{t('deleteManual.delete')}</button></div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
