import polygonClipping from 'polygon-clipping';
import type { MultiPolygon, Polygon as ClipPolygon } from 'polygon-clipping';
import type { RegionData, SpatialEdge } from '../types';

function inclusiveOverlap(aLo: number, aHi: number, bLo: number, bHi: number): number | null {
  const lo = Math.max(aLo, bLo);
  const hi = Math.min(aHi, bHi);
  if (hi < lo) return null;
  return hi - lo + 1;
}

function shoelaceAreaXZ(points: { x: number; z: number }[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return Math.abs(sum) / 2;
}

function shoelaceRing(ring: [number, number][]): number {
  if (ring.length < 3) return 0;
  let sum = 0;
  const n = ring.length;
  // polygon-clipping rings are typically closed (last == first); skip duplicate end.
  const last = n > 1 && ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1]
    ? n - 1
    : n;
  for (let i = 0; i < last; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % last];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}

function multiPolygonArea(mp: MultiPolygon): number {
  let area = 0;
  for (const polygon of mp) {
    for (let i = 0; i < polygon.length; i += 1) {
      const ringArea = shoelaceRing(polygon[i] as [number, number][]);
      // First ring is outer; subsequent rings are holes.
      area += i === 0 ? ringArea : -ringArea;
    }
  }
  return Math.abs(area);
}

function regionYRange(region: RegionData): [number, number] | null {
  if (region.type === 'cuboid' && region.min && region.max) {
    return [region.min.y, region.max.y];
  }
  if (region.type === 'poly2d' && region.min_y != null && region.max_y != null) {
    return [region.min_y, region.max_y];
  }
  return null;
}

/** XZ footprint as polygon-clipping Polygon (matches backend cuboid/poly2d rules). */
function regionXZPolygon(region: RegionData): ClipPolygon | null {
  if (region.type === 'cuboid' && region.min && region.max) {
    const x0 = region.min.x;
    const z0 = region.min.z;
    const x1 = region.max.x;
    const z1 = region.max.z;
    if (x0 === x1 || z0 === z1) return null;
    return [[[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]]];
  }
  if (region.type === 'poly2d' && region.points && region.points.length >= 3) {
    const ring: [number, number][] = region.points.map((p) => [p.x, p.z]);
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([first[0], first[1]]);
    }
    return [ring];
  }
  return null;
}

/** Region volume in blocks (matches backend cuboid/poly2d rules). */
export function regionVolume(region: RegionData): number | null {
  if (region.type === 'cuboid' && region.min && region.max) {
    const dx = region.max.x - region.min.x + 1;
    const dy = region.max.y - region.min.y + 1;
    const dz = region.max.z - region.min.z + 1;
    return dx * dy * dz;
  }
  if (
    region.type === 'poly2d'
    && region.points
    && region.points.length >= 3
    && region.min_y != null
    && region.max_y != null
  ) {
    const area = shoelaceAreaXZ(region.points);
    const height = region.max_y - region.min_y + 1;
    return Math.trunc(area * height);
  }
  return null;
}

/** Cuboid∩cuboid overlap in blocks; null when not both cuboids or empty. */
export function cuboidIntersectionVolume(a: RegionData, b: RegionData): number | null {
  if (a.type !== 'cuboid' || b.type !== 'cuboid' || !a.min || !a.max || !b.min || !b.max) {
    return null;
  }
  const dx = inclusiveOverlap(a.min.x, a.max.x, b.min.x, b.max.x);
  const dy = inclusiveOverlap(a.min.y, a.max.y, b.min.y, b.max.y);
  const dz = inclusiveOverlap(a.min.z, a.max.z, b.min.z, b.max.z);
  if (dx == null || dy == null || dz == null) return null;
  return dx * dy * dz;
}

/**
 * Volume of A ∩ B in blocks for cuboid/poly2d pairs (matches backend intersection_volume).
 * Returns null only when geometry is incomplete or overlap is empty.
 */
export function intersectionVolume(a: RegionData, b: RegionData): number | null {
  const yA = regionYRange(a);
  const yB = regionYRange(b);
  if (!yA || !yB) return null;
  const height = inclusiveOverlap(yA[0], yA[1], yB[0], yB[1]);
  if (height == null) return null;

  if (a.type === 'cuboid' && b.type === 'cuboid') {
    return cuboidIntersectionVolume(a, b);
  }

  const polyA = regionXZPolygon(a);
  const polyB = regionXZPolygon(b);
  if (!polyA || !polyB) return null;
  const inter = polygonClipping.intersection(polyA, polyB);
  if (!inter.length) return null;
  const area = multiPolygonArea(inter);
  if (area <= 0) return null;
  return Math.trunc(area * height);
}

export function findIntersectOverlapBlocks(
  edges: SpatialEdge[],
  regionId: string,
  partnerId: string,
): number | null | undefined {
  for (const edge of edges) {
    if (edge.relation !== 'intersects') continue;
    const match =
      (edge.source === regionId && edge.target === partnerId)
      || (edge.target === regionId && edge.source === partnerId);
    if (!match) continue;
    if (edge.overlapBlocks === undefined) return undefined;
    return edge.overlapBlocks;
  }
  return undefined;
}

/** Format with at most one decimal place (integers stay without fraction). */
export function formatOneDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
