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
