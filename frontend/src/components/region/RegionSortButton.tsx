type Props = {
  active: boolean;
  direction: 'asc' | 'desc';
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  title?: string;
};

export function RegionSortButton({
  active,
  direction,
  onClick,
  children,
  className,
  title,
}: Props) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <span
      role="button"
      tabIndex={0}
      className={`region-sort-btn${className ? ` ${className}` : ''}`}
      onClick={onClick}
      onKeyDown={onKeyDown}
      title={title}
    >
      {children}
      <span className="region-sort-arrow" aria-hidden="true">
        {active ? (direction === 'asc' ? '↑' : '↓') : ''}
      </span>
    </span>
  );
}
