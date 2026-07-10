import { useState } from 'react';

interface AddRegionDialogProps {
  parentOptions: string[];
  onAdd: (data: {
    id: string;
    parent: string | null;
    priority: number;
    flags: Record<string, string>;
  }) => void;
  onClose: () => void;
}

export function AddRegionDialog({ parentOptions, onAdd, onClose }: AddRegionDialogProps) {
  const [id, setId] = useState('');
  const [parent, setParent] = useState('');
  const [priority, setPriority] = useState(0);
  const [flagsText, setFlagsText] = useState('');

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

  const submit = () => {
    if (!id.trim()) return;
    onAdd({
      id: id.trim(),
      parent: parent || null,
      priority,
      flags: parseFlags(),
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Добавить временный регион</h2>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="modal-body form-grid">
          <label>
            ID
            <input value={id} onChange={(e) => setId(e.target.value)} />
          </label>
          <label>
            Родитель
            <select value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">— корень —</option>
              {parentOptions.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Приоритет
            <input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
          </label>
          <label>
            Флаги (key=value, по строке)
            <textarea rows={4} value={flagsText} onChange={(e) => setFlagsText(e.target.value)} />
          </label>
          <button type="button" className="primary" onClick={submit}>Добавить</button>
        </div>
      </div>
    </div>
  );
}
