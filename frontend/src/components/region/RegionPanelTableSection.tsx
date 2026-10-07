import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';

type Props = {
  title: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
  /** Start collapsed (6 visible rows). */
  defaultExpanded?: boolean;
  /** When incremented, section expands (e.g. focus from flag scheme). */
  expandSignal?: number;
};

export function RegionPanelTableSection({
  title,
  hint,
  children,
  actions,
  defaultExpanded = false,
  expandSignal = 0,
}: Props) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    if (expandSignal > 0) setExpanded(true);
  }, [expandSignal]);

  return (
    <div className="region-panel-table-section">
      <div className="region-panel-table-toolbar">
        <div className="region-panel-table-toolbar-title">
          <p className="region-panel-table-title">{title}</p>
          <button
            type="button"
            className="region-panel-table-toggle"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? t('region.tableCollapse') : t('region.tableExpand')}
          </button>
          {actions}
        </div>
      </div>
      {hint}
      <div
        className={`region-panel-table-scroll${expanded ? ' region-panel-table-scroll--expanded' : ''}`}
      >
        {children}
      </div>
    </div>
  );
}
