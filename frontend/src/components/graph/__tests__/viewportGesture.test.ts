import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Core } from 'cytoscape';
import { intersectEdgeLabelFieldsChanged } from '../intersectEdgeLabels';
import {
  beginViewportGesture,
  cancelViewportGesture,
  holdViewportGesture,
  releaseViewportGesture,
  VIEWPORT_GESTURE_SETTLE_MS,
} from '../viewportGesture';

function makeMockCy(renderer: Record<string, unknown>): Core {
  return {
    renderer: () => renderer,
  } as unknown as Core;
}

describe('beginViewportGesture', () => {
  it('sets forcedPixelRatio to 1 and restores after settle', () => {
    let settleCalls = 0;
    let redrawCalls = 0;
    let hinted = false;
    const renderer = {
      forcedPixelRatio: 2 as number | null,
      redrawHint: (layer: string) => {
        if (layer === 'eles') hinted = true;
      },
      redraw: () => {
        redrawCalls += 1;
      },
    };

    const cy = makeMockCy(renderer);
    const pending: Array<() => void> = [];
    const timers = {
      setTimeout: (handler: TimerHandler, ms?: number) => {
        assert.equal(ms, VIEWPORT_GESTURE_SETTLE_MS);
        pending.push(handler as () => void);
        return pending.length;
      },
      clearTimeout: () => {},
    };

    beginViewportGesture(cy, () => {
      settleCalls += 1;
    }, timers);

    assert.equal(renderer.forcedPixelRatio, 1);

    beginViewportGesture(cy, () => {
      settleCalls += 1;
    }, timers);
    assert.equal(renderer.forcedPixelRatio, 1);

    assert.equal(pending.length, 2);
    pending[1]!();

    assert.equal(renderer.forcedPixelRatio, 2);
    assert.equal(settleCalls, 1);
    assert.equal(hinted, true);
    assert.equal(redrawCalls, 1);
  });
});

describe('holdViewportGesture / releaseViewportGesture', () => {
  it('keeps forcedPixelRatio at 1 while held past settle window', () => {
    const renderer = {
      forcedPixelRatio: 2 as number | null,
      redrawHint: () => {},
      redraw: () => {},
    };
    const cy = makeMockCy(renderer);
    const pending: Array<() => void> = [];
    const timers = {
      setTimeout: (handler: TimerHandler, ms?: number) => {
        assert.equal(ms, VIEWPORT_GESTURE_SETTLE_MS);
        pending.push(handler as () => void);
        return pending.length;
      },
      clearTimeout: () => {},
    };

    holdViewportGesture(cy);
    assert.equal(renderer.forcedPixelRatio, 1);
    assert.equal(pending.length, 0);

    holdViewportGesture(cy);
    assert.equal(renderer.forcedPixelRatio, 1);
    assert.equal(pending.length, 0);
  });

  it('restores after release and redraws', () => {
    let settleCalls = 0;
    let redrawCalls = 0;
    let hinted = false;
    const renderer = {
      forcedPixelRatio: 2 as number | null,
      redrawHint: (layer: string) => {
        if (layer === 'eles') hinted = true;
      },
      redraw: () => {
        redrawCalls += 1;
      },
    };
    const cy = makeMockCy(renderer);
    const pending: Array<() => void> = [];
    const timers = {
      setTimeout: (handler: TimerHandler, ms?: number) => {
        assert.equal(ms, VIEWPORT_GESTURE_SETTLE_MS);
        pending.push(handler as () => void);
        return pending.length;
      },
      clearTimeout: () => {},
    };

    holdViewportGesture(cy);
    releaseViewportGesture(cy, () => {
      settleCalls += 1;
    }, timers);

    assert.equal(pending.length, 1);
    pending[0]!();

    assert.equal(renderer.forcedPixelRatio, 2);
    assert.equal(settleCalls, 1);
    assert.equal(hinted, true);
    assert.equal(redrawCalls, 1);
  });

  it('does not overwrite saved ratio on repeated hold', () => {
    const renderer = {
      forcedPixelRatio: 2 as number | null,
      redrawHint: () => {},
      redraw: () => {},
    };
    const cy = makeMockCy(renderer);
    const pending: Array<() => void> = [];
    const timers = {
      setTimeout: (handler: TimerHandler) => {
        pending.push(handler as () => void);
        return pending.length;
      },
      clearTimeout: () => {},
    };

    holdViewportGesture(cy);
    holdViewportGesture(cy);
    releaseViewportGesture(cy, undefined, timers);
    pending[0]!();

    assert.equal(renderer.forcedPixelRatio, 2);
  });
});

describe('cancelViewportGesture', () => {
  it('restores saved forcedPixelRatio and redraws', () => {
    let redrawCalls = 0;
    const renderer = {
      forcedPixelRatio: 1.5 as number | null,
      redrawHint: () => {},
      redraw: () => {
        redrawCalls += 1;
      },
    };

    const cy = makeMockCy(renderer);
    const timers = {
      setTimeout: (handler: TimerHandler) => {
        return 1;
      },
      clearTimeout: () => {},
    };

    beginViewportGesture(cy, undefined, timers);
    assert.equal(renderer.forcedPixelRatio, 1);

    cancelViewportGesture(cy);
    assert.equal(renderer.forcedPixelRatio, 1.5);
    assert.equal(redrawCalls, 1);
  });
});

describe('intersectEdgeLabelFieldsChanged', () => {
  it('skips unchanged label triplets', () => {
    const dataStore: Record<string, string> = {
      intersectCenterLabel: 'a',
      intersectSourceLabel: 'b',
      intersectTargetLabel: 'c',
    };
    const edge = {
      data: (key?: string | Record<string, string>) => {
        if (typeof key === 'string') return dataStore[key];
        if (key) Object.assign(dataStore, key);
        return dataStore;
      },
    };
    assert.equal(
      intersectEdgeLabelFieldsChanged(edge as never, {
        intersectCenterLabel: 'a',
        intersectSourceLabel: 'b',
        intersectTargetLabel: 'c',
      }),
      false,
    );
    assert.equal(
      intersectEdgeLabelFieldsChanged(edge as never, {
        intersectCenterLabel: 'a',
        intersectSourceLabel: 'b',
        intersectTargetLabel: 'x',
      }),
      true,
    );
  });
});
