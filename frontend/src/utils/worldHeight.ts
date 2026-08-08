import type { RegionData } from '../types';

/** Default Overworld build limits (1.18+). Custom worlds may go beyond. */
export const STANDARD_WORLD_MIN_Y = -64;
export const STANDARD_WORLD_MAX_Y = 319;

export function isYOutsideStandardWorld(y: number): boolean {
  return y < STANDARD_WORLD_MIN_Y || y > STANDARD_WORLD_MAX_Y;
}

/** Y values present on a saved region (cuboid min/max.y or poly2d min_y/max_y). */
export function collectRegionYValues(region: RegionData): number[] {
  const ys: number[] = [];
  if (region.min && typeof region.min.y === 'number') ys.push(region.min.y);
  if (region.max && typeof region.max.y === 'number') ys.push(region.max.y);
  if (region.min_y != null) ys.push(region.min_y);
  if (region.max_y != null) ys.push(region.max_y);
  return ys;
}

export function regionHasNonStandardHeight(region: RegionData): boolean {
  return collectRegionYValues(region).some(isYOutsideStandardWorld);
}

export function findNonStandardHeightRegionIds(regions: RegionData[]): string[] {
  return regions.filter(regionHasNonStandardHeight).map((r) => r.id);
}
