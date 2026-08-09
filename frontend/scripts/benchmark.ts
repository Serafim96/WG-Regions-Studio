/**
 * CLI benchmark harness for frontend pure hot paths (no DOM/React/Cytoscape).
 *
 * Usage (from app/frontend):
 *   npx tsx scripts/benchmark.ts --label baseline
 *
 * Expects scheme JSON at scripts/fixtures/synthetic-1500-scheme.json
 * (exported via: python -m backend.tools.benchmark --label baseline --export-scheme ...)
 *
 * Writes ../../docs/dev/benchmarks/frontend-<label>.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import type { FlagInfo, Scheme } from '../src/types';
import { layoutVisibleForest, DEFAULT_LAYOUT_SPACING } from '../src/utils/layout';
import {
  computeEffectiveFlagsByRegion,
  runWorldGuardFlagChecks,
} from '../src/utils/flagConflicts';
import {
  buildFlagHighlight,
  enrichHighlightWithFlagValues,
} from '../src/utils/flagTree';
import { buildStylesheet } from '../src/cytoscape/styles';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = resolve(__dirname, '..');
const APP_ROOT = resolve(FRONTEND_ROOT, '..');
const WORKSPACE_ROOT = resolve(APP_ROOT, '..');
const BENCH_DIR = resolve(WORKSPACE_ROOT, 'docs/dev/benchmarks');
const DEFAULT_SCHEME = resolve(__dirname, 'fixtures/synthetic-1500-scheme.json');
const N_RUNS = 5;

function gitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: APP_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function timeFn(fn: () => void, runs: number): { median: number; min: number } {
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  return {
    median: Math.round(median(samples) * 1000) / 1000,
    min: Math.round(Math.min(...samples) * 1000) / 1000,
  };
}

function parseArgs(argv: string[]): { label: string; schemePath: string; runs: number } {
  let label = 'baseline';
  let schemePath = DEFAULT_SCHEME;
  let runs = N_RUNS;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--label' && argv[i + 1]) {
      label = argv[++i];
    } else if (a === '--scheme' && argv[i + 1]) {
      schemePath = resolve(argv[++i]);
    } else if (a === '--runs' && argv[i + 1]) {
      runs = Number(argv[++i]);
    }
  }
  return { label, schemePath, runs };
}

function buildNodeDims(scheme: Scheme): Map<string, { width: number; height: number }> {
  const dims = new Map<string, { width: number; height: number }>();
  for (const r of scheme.regions) {
    const w = Math.max(60, Math.min(160, 40 + r.id.length * 7));
    dims.set(r.id, { width: w, height: 56 });
  }
  return dims;
}

function stubFlagsCatalog(scheme: Scheme): FlagInfo[] {
  const names = new Set<string>();
  for (const r of scheme.regions) {
    for (const k of Object.keys(r.flags || {})) names.add(k);
  }
  // A few common WG-like stubs so type lookups don't always miss.
  for (const n of ['pvp', 'build', 'greeting', 'entry', 'exit']) names.add(n);
  return [...names].sort().map((name) => ({
    name,
    type: name === 'greeting' ? 'string' : 'state',
    description: '',
    builtin: true,
  }));
}

function main(): void {
  const { label, schemePath, runs } = parseArgs(process.argv.slice(2));
  if (!existsSync(schemePath)) {
    console.error(`Scheme fixture not found: ${schemePath}`);
    console.error(
      'Export it first:\n' +
        '  python -m backend.tools.benchmark --label baseline ' +
        '--export-scheme frontend/scripts/fixtures/synthetic-1500-scheme.json',
    );
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(schemePath, 'utf8')) as Scheme;
  // Backend may emit snake_case overlap_blocks; normalize lightly if needed.
  const scheme: Scheme = {
    ...raw,
    spatialEdges: (raw.spatialEdges || []).map((e) => ({
      ...e,
      overlapBlocks:
        e.overlapBlocks ??
        (e as { overlap_blocks?: number | null }).overlap_blocks ??
        null,
    })),
  };

  const nodeDims = buildNodeDims(scheme);
  const hidden = new Set<string>();
  const flagsCatalog = stubFlagsCatalog(scheme);
  const sampleFlag =
    flagsCatalog.find((f) => f.name === 'pvp')?.name ?? flagsCatalog[0]?.name ?? 'pvp';

  const metrics: Record<string, { median: number; min: number }> = {
    layoutVisibleForest_ms: timeFn(() => {
      layoutVisibleForest(scheme, hidden, nodeDims, DEFAULT_LAYOUT_SPACING);
    }, runs),
    computeEffectiveFlagsByRegion_ms: timeFn(() => {
      computeEffectiveFlagsByRegion(scheme);
    }, runs),
    runWorldGuardFlagChecks_ms: timeFn(() => {
      runWorldGuardFlagChecks({ scheme, flagsCatalog });
    }, runs),
    buildFlagHighlight_enrich_ms: timeFn(() => {
      const hl = buildFlagHighlight(scheme, sampleFlag, {
        showInheritance: true,
        showContains: true,
        showIntersects: true,
        showConflicts: true,
      });
      enrichHighlightWithFlagValues(hl, scheme, sampleFlag, flagsCatalog);
    }, runs),
    buildStylesheet_ms: timeFn(() => {
      buildStylesheet('light');
      buildStylesheet('dark');
    }, runs),
  };

  const result = {
    label: `frontend-${label}`,
    git_commit: gitCommit(),
    timestamp: new Date().toISOString(),
    runs,
    dataset: {
      name: 'synthetic-1500-scheme',
      region_count: scheme.regions.length,
    },
    metrics,
  };

  mkdirSync(BENCH_DIR, { recursive: true });
  const outPath = resolve(BENCH_DIR, `frontend-${label}.json`);
  writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`Wrote ${outPath}`);
  for (const [key, val] of Object.entries(metrics)) {
    console.log(`  ${key}: median=${val.median} ms  min=${val.min} ms`);
  }
}

main();
