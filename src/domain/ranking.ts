/**
 * Standard competition ranking ("1, 2, 2, 4"), the same rule the server uses with rank().
 * Ties keep the input order, so callers pass items pre-sorted by their tie-break.
 */
export function rankWithTies<T>(items: readonly T[], value: (item: T) => number): (T & { rank: number })[] {
  const sorted = items
    .map((item, index) => ({ item, index, v: value(item) }))
    .sort((a, b) => b.v - a.v || a.index - b.index);
  let rank = 0;
  let prev: number | null = null;
  return sorted.map((entry, i) => {
    if (prev === null || entry.v !== prev) {
      rank = i + 1;
      prev = entry.v;
    }
    return { ...entry.item, rank };
  });
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
