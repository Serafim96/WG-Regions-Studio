import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadAppSettings,
  saveAppSettings,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from '../utils/settings';

type ResizeHandle = { resize: () => void } | null;

/**
 * Sidebar width / collapse + drag-resize throttled via rAF.
 */
export function useSidebarLayout(graphRef: React.RefObject<ResizeHandle>) {
  const initial = loadAppSettings();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(initial.sidebarWidth);
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    saveAppSettings({ ...loadAppSettings(), sidebarCollapsed });
  }, [sidebarCollapsed]);

  useEffect(() => {
    saveAppSettings({ ...loadAppSettings(), sidebarWidth });
  }, [sidebarWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = sidebarResizeRef.current;
      if (!drag) return;
      const next = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, drag.startWidth + (e.clientX - drag.startX)),
      );
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setSidebarWidth(next);
        graphRef.current?.resize();
        rafRef.current = null;
      });
    };
    const onUp = () => {
      if (!sidebarResizeRef.current) return;
      sidebarResizeRef.current = null;
      document.body.classList.remove('sidebar-resizing');
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      requestAnimationFrame(() => graphRef.current?.resize());
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [graphRef]);

  const beginResize = useCallback((startX: number, startWidth: number) => {
    sidebarResizeRef.current = { startX, startWidth };
    document.body.classList.add('sidebar-resizing');
  }, []);

  return {
    sidebarCollapsed,
    setSidebarCollapsed,
    sidebarWidth,
    setSidebarWidth,
    beginResize,
  };
}
