/**
 * Flags whose values do not propagate to other regions by spatial containment
 * or intersection (WorldGuard 7.0.19 FlagValueCalculator — PASSTHROUGH).
 */
export const NON_SPATIAL_FLAGS = new Set<string>(['passthrough']);

export function isNonSpatialFlag(flagName: string): boolean {
  return NON_SPATIAL_FLAGS.has(flagName);
}
