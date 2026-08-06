/** Windows Explorer–style natural compare (…_19 before …_189). */
export function compareNatural(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function sortNatural(values: string[]): string[] {
  return [...values].sort(compareNatural);
}
