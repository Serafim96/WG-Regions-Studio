/** Clipboard format for Minecraft coords: `x y z` with spaces, no commas. */
export function formatTpCoords(x: string, y: string, z: string): string | null {
  const xs = x.trim();
  const ys = y.trim();
  const zs = z.trim();
  if (!xs || !ys || !zs) return null;
  if (!/^-?\d+$/.test(xs) || !/^-?\d+$/.test(ys) || !/^-?\d+$/.test(zs)) return null;
  return `${xs} ${ys} ${zs}`;
}
