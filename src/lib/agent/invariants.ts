import { catalog } from "@/lib/catalog";
import type { RecommendRequest, RecommendResult, SessionConstraints } from "./types";

/**
 * Invariants every recommendation must satisfy, independent of which engine
 * produced it. Used by /api/eval, scripts/eval.mjs, and as a runtime guard
 * that annotates results instead of throwing — a judge-visible "self-check".
 */

export interface InvariantResult {
  ok: boolean;
  failures: string[];
}

const catalogById = new Map(catalog.map((item) => [item.id, item]));

export function checkResult(
  result: RecommendResult,
  request: RecommendRequest,
  constraints?: Partial<SessionConstraints>,
): InvariantResult {
  const failures: string[] = [];
  const budgetMax = constraints?.budgetMax ?? request.budget?.max ?? 100;
  const budgetMin = constraints?.budgetMin ?? request.budget?.min ?? 0;
  const avoided = new Set(constraints?.avoidItemIds ?? []);
  const categorySet =
    request.categories && request.categories.length > 0 ? new Set(request.categories) : undefined;

  const allItems = result.picks.flatMap((pick) => pick.items);
  const ids = allItems.map((item) => item.id);

  // 1. Every pick is a real catalog item.
  for (const id of ids) {
    if (!catalogById.has(id)) failures.push(`pick ${id} is not in the catalog`);
  }

  // 2. Budget is respected per item and per bundle.
  for (const pick of result.picks) {
    if (pick.lane === "bundle") {
      if (pick.totalPrice > budgetMax) {
        failures.push(`bundle total $${pick.totalPrice} exceeds budget $${budgetMax}`);
      }
      if (pick.items.length < 2) failures.push(`bundle has ${pick.items.length} item(s), expected 2-3`);
      if (pick.items.length > 3) failures.push(`bundle has ${pick.items.length} items, expected 2-3`);
    }
    for (const item of pick.items) {
      if (item.price > budgetMax) failures.push(`${item.id} ($${item.price}) exceeds budget $${budgetMax}`);
      if (item.price < budgetMin) failures.push(`${item.id} ($${item.price}) is below the floor $${budgetMin}`);
    }
  }

  // 3. No item repeats across lanes.
  if (new Set(ids).size !== ids.length) failures.push("the same item appears in more than one lane");

  // 4. Avoided picks never come back.
  for (const id of ids) {
    if (avoided.has(id)) failures.push(`${id} was explicitly avoided but returned`);
  }

  // 5. Category filter is honored.
  if (categorySet) {
    for (const item of allItems) {
      if (!categorySet.has(item.category)) {
        failures.push(`${item.id} is ${item.category}, outside the requested categories`);
      }
    }
  }

  // 6. The wild card should not simply repeat the safe pick's category (unless the user explicitly filtered to one category).
  const safe = result.picks.find((pick) => pick.lane === "safe");
  const surprise = result.picks.find((pick) => pick.lane === "surprise");
  if (safe && surprise && safe.items[0] && surprise.items[0]) {
    if ((!categorySet || categorySet.size > 1) && safe.items[0].category === surprise.items[0].category) {
      failures.push("wild card is in the same category as the safe bet — not a surprise");
    }
    if (safe.items[0].entityName === surprise.items[0].entityName) {
      failures.push("wild card shares the safe bet's entity");
    }
  }

  // 7. Every pick carries at least one taste signal.
  for (const item of allItems) {
    if (item.matchedInterests.length === 0) failures.push(`${item.id} has no contributing taste signal`);
  }

  // 8. Affinity is a probability.
  for (const item of allItems) {
    if (!Number.isFinite(item.affinity) || item.affinity < 0 || item.affinity > 1) {
      failures.push(`${item.id} has an out-of-range affinity (${item.affinity})`);
    }
  }

  return { ok: failures.length === 0, failures };
}
