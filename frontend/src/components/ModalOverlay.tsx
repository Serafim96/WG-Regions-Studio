import { useRef, type ReactNode, type MouseEvent } from 'react';

export function ModalOverlay({
  onClose,
  children,
  className = '',
}: {
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const downOnOverlay = useRef(false);

  const onMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    downOnOverlay.current = e.target === e.currentTarget;
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && downOnOverlay.current) {
      onClose();
    }
    downOnOverlay.current = false;
  };

  return (
    <div className={`modal-overlay ${className}`.trim()} onMouseDown={onMouseDown} onClick={onClick}>
      {children}
    </div>
  );
}
