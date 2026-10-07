import type { Core } from 'cytoscape';

export const VIEWPORT_GESTURE_SETTLE_MS = 180;

type CyRenderer = {
  forcedPixelRatio?: number | null;
  redrawHint: (layer: string, bool?: boolean) => void;
  redraw: () => void;
};

export type ViewportGestureTimers = {
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
};

const defaultTimers: ViewportGestureTimers = {
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
};

const settleTimerByCy = new WeakMap<Core, ReturnType<typeof setTimeout>>();
const timersByCy = new WeakMap<Core, ViewportGestureTimers>();
const savedForcedPixelRatioByCy = new WeakMap<Core, number | null>();
const holdActiveByCy = new WeakMap<Core, boolean>();

type CyWithRenderer = Core & {
  renderer: () => unknown;
};

function rendererOf(cy: Core): CyRenderer | null {
  const r = (cy as CyWithRenderer).renderer();
  if (!r || typeof r !== 'object') return null;
  return r as CyRenderer;
}

function restoreForcedPixelRatio(cy: Core, r: CyRenderer): void {
  if (!savedForcedPixelRatioByCy.has(cy)) return;
  r.forcedPixelRatio = savedForcedPixelRatioByCy.get(cy) ?? null;
  savedForcedPixelRatioByCy.delete(cy);
}

function clearSettleTimer(cy: Core, timers: ViewportGestureTimers): void {
  const pending = settleTimerByCy.get(cy);
  if (pending !== undefined) {
    timers.clearTimeout(pending);
    settleTimerByCy.delete(cy);
  }
}

function scheduleViewportGestureSettle(
  cy: Core,
  r: CyRenderer,
  onSettle?: () => void,
  timers: ViewportGestureTimers = defaultTimers,
): void {
  clearSettleTimer(cy, timers);

  const id = timers.setTimeout(() => {
    settleTimerByCy.delete(cy);
    restoreForcedPixelRatio(cy, r);
    onSettle?.();
    r.redrawHint('eles', true);
    r.redraw();
  }, VIEWPORT_GESTURE_SETTLE_MS);

  settleTimerByCy.set(cy, id);
}

function ensureLowPixelRatio(cy: Core, r: CyRenderer): void {
  if (!savedForcedPixelRatioByCy.has(cy)) {
    savedForcedPixelRatioByCy.set(cy, r.forcedPixelRatio ?? null);
  }
  r.forcedPixelRatio = 1;
}

export function holdViewportGesture(cy: Core): void {
  timersByCy.set(cy, defaultTimers);

  const r = rendererOf(cy);
  if (!r) return;

  ensureLowPixelRatio(cy, r);

  const timers = timersByCy.get(cy) ?? defaultTimers;
  clearSettleTimer(cy, timers);
  holdActiveByCy.set(cy, true);
}

export function releaseViewportGesture(
  cy: Core,
  onSettle?: () => void,
  timers: ViewportGestureTimers = defaultTimers,
): void {
  if (!holdActiveByCy.get(cy)) return;
  holdActiveByCy.set(cy, false);

  const r = rendererOf(cy);
  if (!r) return;

  timersByCy.set(cy, timers);
  scheduleViewportGestureSettle(cy, r, onSettle, timers);
}

export function cancelViewportGesture(cy: Core): void {
  holdActiveByCy.set(cy, false);

  const timers = timersByCy.get(cy) ?? defaultTimers;
  clearSettleTimer(cy, timers);

  const r = rendererOf(cy);
  if (!r) return;
  restoreForcedPixelRatio(cy, r);
  r.redrawHint('eles', true);
  r.redraw();
}

export function beginViewportGesture(
  cy: Core,
  onSettle?: () => void,
  timers: ViewportGestureTimers = defaultTimers,
): void {
  timersByCy.set(cy, timers);

  const r = rendererOf(cy);
  if (!r) return;

  ensureLowPixelRatio(cy, r);

  if (holdActiveByCy.get(cy)) return;

  scheduleViewportGestureSettle(cy, r, onSettle, timers);
}
