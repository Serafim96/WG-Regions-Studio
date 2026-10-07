/**
 * Conflicts between different WorldGuard flags.
 * Rules are taken from WorldGuard 7.0.19 source (see docs/dev/CROSS_FLAG_CONFLICT_RULES.md).
 * An unset flag is neither allow nor deny.
 */

export type CrossFlagCategory =
  | 'overridden'
  | 'negated'
  | 'range'
  | 'hazard'
  | 'ignored'
  | 'leak'
  | 'dead';

export interface CrossFlagRef {
  name: string;
  value: unknown;
  definedBy: string | null;
}

export interface CrossFlagHit {
  ruleId: string;
  category: CrossFlagCategory;
  reasonKey: string;
  flags: CrossFlagRef[];
}

export interface CrossFlagConflict extends CrossFlagHit {
  severity: 'warning';
  scope: 'region' | 'overlap';
  regionId: string;
  otherRegionId?: string;
  relation?: 'intersects' | 'contains';
}

type FlagMap = Map<string, unknown>;

const A1_NARROW = ['use', 'sleep', 'respawn-anchors', 'ride', 'use-dripleaf', 'tnt'] as const;
const A2_NARROW = ['tnt', 'block-trampling'] as const;
const A3_NARROW = ['lighter', 'frosted-ice-form', 'block-trampling'] as const;
const A4_WIDE = ['block-place', 'lighter'] as const;
const A4_NARROW = ['fire-spread', 'lava-fire'] as const;
const B1_NARROW = ['pvp', 'mob-damage', 'fall-damage', 'natural-hunger-drain'] as const;

function stateOf(flags: FlagMap, name: string): 'allow' | 'deny' | null {
  if (!flags.has(name)) return null;
  const value = flags.get(name);
  if (typeof value !== 'string') return null;
  const token = value.trim().toLowerCase();
  if (token === 'allow' || token === 'deny') return token;
  return null;
}

function numberOf(flags: FlagMap, name: string): number | null {
  if (!flags.has(name)) return null;
  const value = flags.get(name);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function textOf(flags: FlagMap, name: string): string | null {
  if (!flags.has(name)) return null;
  const value = flags.get(name);
  if (typeof value !== 'string') return null;
  return value.trim().toLowerCase();
}

/** Missing group is the WorldGuard default, all. */
function groupOf(flags: FlagMap, name: string): string {
  const raw = flags.get(`${name}-group`);
  if (typeof raw !== 'string' || !raw.trim()) return 'all';
  return raw.trim().toLowerCase();
}

function sameGroup(flags: FlagMap, names: string[]): boolean {
  const groups = names.map((name) => groupOf(flags, name));
  return groups.every((group) => group === groups[0]);
}

function ref(flags: FlagMap, name: string, definedBy: (name: string) => string | null): CrossFlagRef {
  return { name, value: flags.get(name), definedBy: definedBy(name) };
}

function push(
  hits: CrossFlagHit[],
  flags: FlagMap,
  definedBy: (name: string) => string | null,
  hit: { ruleId: string; category: CrossFlagCategory; reasonKey: string; names: string[] },
) {
  if (!sameGroup(flags, hit.names)) return;
  hits.push({
    ruleId: hit.ruleId,
    category: hit.category,
    reasonKey: hit.reasonKey,
    flags: hit.names.map((name) => ref(flags, name, definedBy)),
  });
}

function allowDeniedBy(
  hits: CrossFlagHit[],
  flags: FlagMap,
  definedBy: (name: string) => string | null,
  ruleId: string,
  reasonKey: string,
  blocker: string,
  narrow: readonly string[],
) {
  if (stateOf(flags, blocker) !== 'deny') return;
  for (const name of narrow) {
    if (stateOf(flags, name) !== 'allow') continue;
    push(hits, flags, definedBy, {
      ruleId,
      category: 'overridden',
      reasonKey,
      names: [blocker, name],
    });
  }
}

/**
 * Find cross-flag conflicts in one effective flag map.
 * `definedBy(name)` is the region that locally sets that flag, if known.
 */
export function findCrossFlagHits(
  flags: FlagMap,
  definedBy: (name: string) => string | null = () => null,
): CrossFlagHit[] {
  const hits: CrossFlagHit[] = [];

  allowDeniedBy(hits, flags, definedBy, 'A1', 'crossFlag.reason.A1', 'interact', A1_NARROW);
  allowDeniedBy(hits, flags, definedBy, 'A2', 'crossFlag.reason.A2', 'block-break', A2_NARROW);
  allowDeniedBy(hits, flags, definedBy, 'A3', 'crossFlag.reason.A3', 'block-place', A3_NARROW);

  const a4Blockers = A4_WIDE.filter((name) => stateOf(flags, name) === 'deny');
  const a4Narrow = A4_NARROW.filter((name) => stateOf(flags, name) === 'allow');
  if (a4Blockers.length > 0 && a4Narrow.length > 0) {
    push(hits, flags, definedBy, {
      ruleId: 'A4',
      category: 'overridden',
      reasonKey: 'crossFlag.reason.A4',
      names: [...a4Blockers, ...a4Narrow],
    });
  }

  if (stateOf(flags, 'invincible') === 'allow') {
    for (const name of B1_NARROW) {
      if (stateOf(flags, name) !== 'allow') continue;
      push(hits, flags, definedBy, {
        ruleId: 'B1',
        category: 'negated',
        reasonKey: 'crossFlag.reason.B1',
        names: ['invincible', name],
      });
    }
  }

  const mode = textOf(flags, 'game-mode');
  const protectedMode = mode === 'creative' || mode === 'spectator' || stateOf(flags, 'invincible') === 'allow';
  if (protectedMode) {
    const names = ['invincible', 'game-mode', 'heal-amount', 'feed-amount'].filter((name) => flags.has(name));
    const healHurts = (numberOf(flags, 'heal-amount') ?? 0) < 0 && flags.has('heal-amount');
    const feedHurts = (numberOf(flags, 'feed-amount') ?? 0) < 0 && flags.has('feed-amount');
    if (healHurts || feedHurts) {
      const involved = names.filter((name) => {
        if (name === 'heal-amount') return healHurts;
        if (name === 'feed-amount') return feedHurts;
        if (name === 'invincible') return stateOf(flags, 'invincible') === 'allow';
        return mode === 'creative' || mode === 'spectator';
      });
      push(hits, flags, definedBy, {
        ruleId: 'B2',
        category: 'negated',
        reasonKey: 'crossFlag.reason.B2',
        names: involved,
      });
    }
  }

  const healMin = numberOf(flags, 'heal-min-health');
  const healMax = numberOf(flags, 'heal-max-health');
  if (healMin != null && healMax != null && healMin > healMax) {
    push(hits, flags, definedBy, {
      ruleId: 'C1',
      category: 'range',
      reasonKey: 'crossFlag.reason.C1',
      names: ['heal-min-health', 'heal-max-health'],
    });
  }
  const feedMin = numberOf(flags, 'feed-min-hunger');
  const feedMax = numberOf(flags, 'feed-max-hunger');
  if (feedMin != null && feedMax != null && feedMin > feedMax) {
    push(hits, flags, definedBy, {
      ruleId: 'C1',
      category: 'range',
      reasonKey: 'crossFlag.reason.C1',
      names: ['feed-min-hunger', 'feed-max-hunger'],
    });
  }

  const healAmount = numberOf(flags, 'heal-amount');
  const healDelay = numberOf(flags, 'heal-delay');
  if (
    healDelay === 0
    && healAmount != null
    && healAmount < 0
    && (healMin == null || healMin <= 0)
  ) {
    const names = ['heal-delay', 'heal-amount'];
    if (flags.has('heal-min-health')) names.push('heal-min-health');
    push(hits, flags, definedBy, {
      ruleId: 'C2',
      category: 'hazard',
      reasonKey: 'crossFlag.reason.C2',
      names,
    });
  }
  const feedAmount = numberOf(flags, 'feed-amount');
  const feedDelay = numberOf(flags, 'feed-delay');
  if (
    feedDelay === 0
    && feedAmount != null
    && feedAmount < 0
    && (feedMin == null || feedMin <= 0)
  ) {
    const names = ['feed-delay', 'feed-amount'];
    if (flags.has('feed-min-hunger')) names.push('feed-min-hunger');
    push(hits, flags, definedBy, {
      ruleId: 'C2',
      category: 'hazard',
      reasonKey: 'crossFlag.reason.C2feed',
      names,
    });
  }

  if (flags.has('allowed-cmds') && flags.has('blocked-cmds')) {
    push(hits, flags, definedBy, {
      ruleId: 'D1',
      category: 'ignored',
      reasonKey: 'crossFlag.reason.D1',
      names: ['allowed-cmds', 'blocked-cmds'],
    });
  }

  if (stateOf(flags, 'exit') === 'deny' && stateOf(flags, 'exit-via-teleport') !== 'deny') {
    push(hits, flags, definedBy, {
      ruleId: 'E1',
      category: 'leak',
      reasonKey: 'crossFlag.reason.E1',
      names: ['exit', 'exit-via-teleport'],
    });
  }

  if (flags.has('entry-deny-message') && stateOf(flags, 'entry') !== 'deny') {
    push(hits, flags, definedBy, {
      ruleId: 'F1',
      category: 'dead',
      reasonKey: 'crossFlag.reason.F1',
      names: ['entry-deny-message', 'entry'],
    });
  }

  if (stateOf(flags, 'exit') !== 'deny') {
    if (flags.has('exit-deny-message')) {
      push(hits, flags, definedBy, {
        ruleId: 'F2',
        category: 'dead',
        reasonKey: 'crossFlag.reason.F2',
        names: ['exit-deny-message', 'exit'],
      });
    }
    if (flags.has('exit-via-teleport')) {
      push(hits, flags, definedBy, {
        ruleId: 'F2',
        category: 'dead',
        reasonKey: 'crossFlag.reason.F2teleport',
        names: ['exit-via-teleport', 'exit'],
      });
    }
  }

  const healExtras = ['heal-delay', 'heal-min-health', 'heal-max-health'].filter((name) => flags.has(name));
  if (healExtras.length > 0 && (healAmount == null || healAmount === 0)) {
    push(hits, flags, definedBy, {
      ruleId: 'F3',
      category: 'dead',
      reasonKey: 'crossFlag.reason.F3',
      names: healExtras,
    });
  }
  const feedExtras = ['feed-delay', 'feed-min-hunger', 'feed-max-hunger'].filter((name) => flags.has(name));
  if (feedExtras.length > 0 && (feedAmount == null || feedAmount === 0)) {
    push(hits, flags, definedBy, {
      ruleId: 'F3',
      category: 'dead',
      reasonKey: 'crossFlag.reason.F3feed',
      names: feedExtras,
    });
  }

  if (stateOf(flags, 'mob-spawning') === 'deny' && flags.has('deny-spawn')) {
    push(hits, flags, definedBy, {
      ruleId: 'F4',
      category: 'dead',
      reasonKey: 'crossFlag.reason.F4',
      names: ['mob-spawning', 'deny-spawn'],
    });
  }

  return hits;
}

/** Flag names that can participate in a cross-flag rule. Used to skip irrelevant overlaps. */
export const CROSS_FLAG_NAMES: ReadonlySet<string> = new Set([
  'allowed-cmds', 'block-break', 'block-place', 'block-trampling', 'blocked-cmds',
  'deny-spawn', 'entry', 'entry-deny-message', 'exit', 'exit-deny-message', 'exit-via-teleport',
  'fall-damage', 'feed-amount', 'feed-delay', 'feed-max-hunger', 'feed-min-hunger',
  'fire-spread', 'frosted-ice-form', 'game-mode', 'heal-amount', 'heal-delay',
  'heal-max-health', 'heal-min-health', 'interact', 'invincible', 'lava-fire', 'lighter',
  'mob-damage', 'mob-spawning', 'natural-hunger-drain', 'pvp', 'respawn-anchors',
  'ride', 'sleep', 'tnt', 'use', 'use-dripleaf',
]);
