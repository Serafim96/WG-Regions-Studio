import type { FlagInfo } from '../types';
import { useI18n } from '../i18n/I18nContext';

const FIXED_OPTIONS: Record<string, string[]> = {
  state: ['allow', 'deny'],
  boolean: ['true', 'false'],
  gamemode: ['survival', 'creative', 'adventure', 'spectator'],
  weather: ['clear', 'downfall', 'rain'],
};

const SET_TYPES = new Set(['set of strings', 'set of entity types']);

export function flagTypeHasFixedValues(flagType: string | undefined): boolean {
  if (!flagType) return false;
  return Object.prototype.hasOwnProperty.call(FIXED_OPTIONS, flagType.toLowerCase());
}

export function flagTypeIsSet(flagType: string | undefined): boolean {
  if (!flagType) return false;
  return SET_TYPES.has(flagType.toLowerCase());
}

export function FlagValueInput({
  value,
  flagType,
  onChange,
  placeholder,
}: {
  value: string;
  flagType: string | undefined;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const { t } = useI18n();
  const normalized = (flagType ?? '').toLowerCase();
  const options = FIXED_OPTIONS[normalized];

  if (options) {
    const known = options.includes(value);
    return (
      <select
        value={known ? value : ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>
          {t('flagsManager.pickFixedValue')}
        </option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
        {!known && value !== '' && (
          <option value={value}>{value}</option>
        )}
      </select>
    );
  }

  if (SET_TYPES.has(normalized)) {
    return (
      <div className="flag-value-set">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? t('flagsManager.setOfStringsPlaceholder')}
        />
        <p className="flag-value-hint">{t('flagsManager.setOfStringsHint')}</p>
      </div>
    );
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

export function findFlagType(flagsCatalog: FlagInfo[], name: string): string | undefined {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;
  return flagsCatalog.find((f) => f.name.toLowerCase() === needle)?.type;
}
