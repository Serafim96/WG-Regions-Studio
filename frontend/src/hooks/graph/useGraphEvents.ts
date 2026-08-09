import { useEffect, useLayoutEffect } from 'react';
import type { Core } from 'cytoscape';
import type { StylesheetStyle } from 'cytoscape';
import { buildStylesheet } from '../../cytoscape/styles';
import { applyRegionNodeStyles } from '../../components/graph/nodeStyles';
import type { ContextMenuState } from '../../components/graph/types';
import type { Theme } from '../../theme/ThemeContext';

/**
 * Graph interaction side-effects: context-menu close, lock, theme, selection.
 */
export function useGraphEvents(opts: {
  cyRef: React.RefObject<Core | null>;
  locked: boolean;
  selectedId: string | null;
  theme: Theme;
  contextMenu: ContextMenuState | null;
  setContextMenu: (v: ContextMenuState | null) => void;
  contextMenuRef: React.RefObject<HTMLDivElement | null>;
}) {
  const {
    cyRef,
    locked,
    selectedId,
    theme,
    contextMenu,
    setContextMenu,
    contextMenuRef,
  } = opts;

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [setContextMenu]);

  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const el = contextMenuRef.current;
    const pad = 8;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = contextMenu.x;
    let y = contextMenu.y;
    if (y + rect.height > vh - pad) {
      y = Math.max(pad, contextMenu.y - rect.height);
    }
    if (y + rect.height > vh - pad) {
      y = Math.max(pad, vh - pad - rect.height);
    }
    if (x + rect.width > vw - pad) {
      x = Math.max(pad, vw - pad - rect.width);
    }
    if (x < pad) x = pad;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }, [contextMenu, contextMenuRef]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (locked) {
      cy.nodes().panify();
    } else {
      cy.nodes().unpanify();
      cy.nodes().grabify();
    }
  }, [locked, cyRef]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.style().fromJson(buildStylesheet(theme) as StylesheetStyle[]);
    applyRegionNodeStyles(cy);
  }, [theme, cyRef]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass('selected');
    if (selectedId) {
      const node = cy.getElementById(selectedId);
      if (node.nonempty()) node.addClass('selected');
    }
  }, [selectedId, cyRef]);
}
