export const REGION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function isValidRegionId(id: string): boolean {
  return id.length > 0 && REGION_ID_PATTERN.test(id);
}
