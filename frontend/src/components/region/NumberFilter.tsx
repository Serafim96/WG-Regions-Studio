import { useI18n } from '../../i18n/I18nContext';
import type { PercentCompareOp } from '../../utils/tableSearch';

type Props = {
  op: PercentCompareOp;
  value: string;
  onOpChange: (op: PercentCompareOp) => void;
  onValueChange: (value: string) => void;
  ariaLabel: string;
  opAriaLabel?: string;
  placeholder?: string;
};

export function NumberFilter({
  op,
  value,
  onOpChange,
  onValueChange,
  ariaLabel,
  opAriaLabel,
  placeholder,
}: Props) {
  const { t } = useI18n();
  return (
    <div className="region-effective-percent-filter">
      <select
        value={op}
        onChange={(e) => onOpChange(e.target.value as PercentCompareOp)}
        aria-label={opAriaLabel ?? t('region.percentFilterOp')}
      >
        <option value="eq">{t('region.percentOp.eq')}</option>
        <option value="ne">{t('region.percentOp.ne')}</option>
        <option value="gt">{t('region.percentOp.gt')}</option>
        <option value="lt">{t('region.percentOp.lt')}</option>
        <option value="gte">{t('region.percentOp.gte')}</option>
        <option value="lte">{t('region.percentOp.lte')}</option>
      </select>
      <input
        type="number"
        step="any"
        className="search-input region-effective-filter"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
    </div>
  );
}
