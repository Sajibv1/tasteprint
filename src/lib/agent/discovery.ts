interface DiscoverySignal {
  id: string;
  category: string;
  entity: string;
  affinity: number;
}

/** Keep strong matches while making room for different gift formats and tastes. */
export function diverseDiscoveries<T>(
  items: T[],
  describe: (item: T) => DiscoverySignal,
  limit = 24,
): T[] {
  const remaining = items.map((item) => ({ item, ...describe(item) }));
  const categories = new Map<string, number>();
  const entities = new Map<string, number>();
  const seen = new Set<string>();
  const selected: T[] = [];
  const strongest = Math.max(0, ...remaining.map((entry) => entry.affinity));
  // Diversity must not turn a very weak match into a recommendation.
  const floor = Math.min(strongest, Math.max(0.15, strongest * 0.55));

  while (remaining.length > 0 && selected.length < limit) {
    let bestIndex = -1;
    let bestScore = -Infinity;
    remaining.forEach((entry, index) => {
      if (seen.has(entry.id) || entry.affinity < floor) return;
      const score = entry.affinity
        - Math.min(0.12, (categories.get(entry.category) ?? 0) * 0.035)
        - Math.min(0.16, (entities.get(entry.entity) ?? 0) * 0.08);
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    });
    if (bestIndex < 0) break;
    const [entry] = remaining.splice(bestIndex, 1);
    selected.push(entry.item);
    seen.add(entry.id);
    categories.set(entry.category, (categories.get(entry.category) ?? 0) + 1);
    entities.set(entry.entity, (entities.get(entry.entity) ?? 0) + 1);
  }
  return selected;
}
