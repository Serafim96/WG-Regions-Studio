/** Display % so tiny non-zero coverage is never rounded to 0.0%. */
export function formatCoveragePercent(percent: number, maxChars = 10): string {
  if (!Number.isFinite(percent) || percent <= 0) return '0%';

  if (percent >= 0.05) {
    const one = percent.toFixed(1);
    if (Number(one) > 0) return `${one}%`;
  }

  for (let decimals = 2; decimals <= 16; decimals += 1) {
    const raw = percent.toFixed(decimals);
    if (Number(raw) <= 0) continue;
    const compact = compressTinyPercent(raw, maxChars);
    return `${compact}%`;
  }

  return '<0.000001%';
}

function compressTinyPercent(raw: string, maxChars: number): string {
  if (raw.length <= maxChars) return raw;
  const match = /^0\.(0*)([1-9]\d*)$/.exec(raw);
  if (!match) return raw.length > maxChars ? `${raw.slice(0, maxChars - 1)}…` : raw;

  const zeroRun = match[1];
  const tail = match[2];
  if (zeroRun.length <= 1) {
    return raw.length > maxChars ? `${raw.slice(0, maxChars - 1)}…` : raw;
  }

  const tailLen = Math.max(1, Math.min(3, maxChars - 5));
  const tailEnd = tail.slice(-tailLen);
  const compressed = `0.0..${tailEnd}`;
  if (compressed.length <= maxChars) return compressed;
  return `0.0..${tailEnd.slice(-1)}`;
}
