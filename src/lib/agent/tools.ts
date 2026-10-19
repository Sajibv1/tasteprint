import { catalog } from "@/lib/catalog";
import { getInsights, searchEntities } from "@/lib/qloo/client";
import type { QlooEntity } from "@/lib/qloo/types";
import type { Contributor, GiftItem, LaneKey, ProgressSink } from "./types";
import { diverseDiscoveries } from "./discovery";

/**
 * Tool layer for the agent loop.
 *
 * The deterministic pipeline in `pipeline.ts` runs these same operations in a
 * fixed order. Here they are exposed one at a time so the model can decide
 * which move comes next — which interest to resolve, whether a second hop is
 * worth another Qloo call, which basket to keep when one blows the budget.
 *
 * Every tool returns compact, model-readable JSON plus an optional UI event so
 * the transcript keeps narrating what is happening.
 */

export const DISCOVERY_TYPES = ["urn:entity:artist", "urn:entity:brand", "urn:entity:book", "urn:entity:movie"];

export const INTEREST_SEARCH_TYPES = [
  "urn:entity:artist",
  "urn:entity:movie",
  "urn:entity:tv_show",
  "urn:entity:book",
  "urn:entity:podcast",
  "urn:entity:person",
  "urn:entity:videogame",
  "urn:entity:brand",
];

export function shortType(type: string): string {
  return type.replace(/^urn:entity:/, "").replace(/_/g, " ");
}

export function popularityOf(entity: QlooEntity): number {
  if (typeof entity.popularity === "number") return entity.popularity;
  const property = entity.properties?.popularity;
  return typeof property === "number" ? property : 0;
}

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export interface ResolvedEntity {
  input: string;
  id: string;
  name: string;
  type: string;
  popularity: number;
  alternates: { name: string; type: string; popularity: number }[];
  candidates: { name: string; type: string; popularity: number }[];
  exact: boolean;
}

export interface ScoredCandidate {
  itemId: string;
  title: string;
  category: string;
  price: number;
  entityId: string;
  entityName: string;
  entityType: string;
  affinity: number;
  hops?: number;
  via?: string;
  contributors: Contributor[];
}

export interface ToolContext {
  sink?: ProgressSink;
  warnings: string[];
}

function warn(context: ToolContext, message: string): void {
  context.warnings.push(message);
  context.sink?.({ type: "warning", message });
}

/**
 * Resolve one interest to the single best Qloo entity, returning alternates so
 * the model can flag ambiguity instead of silently guessing.
 */
export async function toolResolveEntity(
  params: { interest: string; type?: string },
  context: ToolContext,
): Promise<ResolvedEntity | { error: string }> {
  const name = params.interest.trim();
  if (name.length === 0) return { error: "interest cannot be empty" };

  context.sink?.({
    type: "stage",
    stage: "resolve",
    label: `Resolving “${name}” against Qloo's entity index`,
    detail: params.type ? `looking for ${shortType(params.type)}` : "searching every type",
  });

  const requestedType = params.type;
  let entities = await searchEntities(name, { types: requestedType ? [requestedType] : INTEREST_SEARCH_TYPES, take: requestedType ? 5 : 8 });
  let sameName = entities.filter((entity) => entity.name.toLowerCase() === name.toLowerCase());
  let droppedOverride = false;
  if (requestedType && sameName.length === 0) {
    entities = await searchEntities(name, { types: INTEREST_SEARCH_TYPES, take: 8 });
    sameName = entities.filter((entity) => entity.name.toLowerCase() === name.toLowerCase());
    droppedOverride = true;
  }

  const ranked = [...(sameName.length > 0 ? sameName : entities)].sort((a, b) => popularityOf(b) - popularityOf(a));
  const entity = ranked[0];
  if (!entity) {
    warn(context, `No Qloo entity matched “${name}” — skipped.`);
    return { error: `No Qloo match for "${name}"` };
  }

  const alternates: ResolvedEntity["alternates"] = [];
  const seenTypes = new Set<string>([entity.type]);
  for (const candidate of sameName) {
    if (seenTypes.has(candidate.type)) continue;
    seenTypes.add(candidate.type);
    alternates.push({ name: candidate.name, type: candidate.type, popularity: popularityOf(candidate) });
  }

  const candidates: ResolvedEntity["candidates"] = [];
  if (sameName.length === 0) {
    const seenIds = new Set<string>([entity.entity_id]);
    for (const candidate of entities) {
      if (seenIds.has(candidate.entity_id)) continue;
      seenIds.add(candidate.entity_id);
      candidates.push({ name: candidate.name, type: candidate.type, popularity: popularityOf(candidate) });
      if (candidates.length >= 3) break;
    }
  }

  const exact = sameName.length > 0;
  context.sink?.({
    type: "interest",
    input: name,
    matchedName: entity.name,
    entityType: shortType(entity.type),
    note: droppedOverride
      ? `no ${shortType(requestedType ?? "")} found — matched as ${shortType(entity.type)}`
      : exact
        ? undefined
        : "closest match used",
  });
  if (droppedOverride) {
    warn(context, `No ${shortType(requestedType ?? "")} named “${name}” — matched as ${shortType(entity.type)} instead.`);
  } else if (!exact) {
    warn(context, `No exact Qloo match for “${name}” — using “${entity.name}” (${shortType(entity.type)}).`);
  }

  return {
    input: name,
    id: entity.entity_id,
    name: entity.name,
    type: entity.type,
    popularity: popularityOf(entity),
    alternates: alternates.slice(0, 3),
    candidates,
    exact,
  };
}

export interface ExpandedEntity {
  id: string;
  name: string;
  type: string;
  affinity: number;
  hops: 1 | 2;
  via?: string;
  seed?: string;
}

/**
 * One taste-expansion hop across four discovery domains. Hop 1 uses the seed
 * entities; hop 2 uses the bridges the model picked from hop 1.
 */
export async function toolExpandTaste(
  params: {
    signalIds: string[];
    signalWeights?: number[];
    bridgeIds?: string[];
    seedNames: Record<string, string>;
    bridgeNames?: Record<string, string>;
    excludeIds?: string[];
    perType?: number;
    mood?: "adventurous" | "grounded";
  },
  context: ToolContext,
): Promise<{ entities: ExpandedEntity[]; failedDomains: number }> {
  const hops = params.bridgeIds && params.bridgeIds.length > 0 ? 2 : 1;
  const signals = hops === 2 ? [...params.signalIds, ...params.bridgeIds!] : params.signalIds;
  const signalWeights = params.signalWeights
    ? [...params.signalWeights, ...Array(Math.max(0, signals.length - params.signalWeights.length)).fill(1)]
    : undefined;
  const exclude = new Set([...params.signalIds, ...(params.bridgeIds ?? []), ...(params.excludeIds ?? [])]);
  const perType = Math.min(params.perType ?? 12, 25);
  const biasTrends =
    params.mood === "adventurous" ? "mid" : params.mood === "grounded" ? "very_low" : undefined;

  context.sink?.({
    type: "stage",
    stage: hops === 2 ? "hop2" : "expand",
    label:
      hops === 2
        ? "Second hop — chasing connections through the newly discovered taste"
        : "Expanding taste across music, brands, books and film",
    detail:
      hops === 2
        ? `bridging through ${params.bridgeIds!.length} discovery${params.bridgeIds!.length === 1 ? "" : "ies"}`
        : `${params.signalIds.length} seed signal${params.signalIds.length === 1 ? "" : "s"} · four discovery domains`,
  });

  const settled = await Promise.allSettled(
    DISCOVERY_TYPES.map((type) =>
      getInsights({
        filterType: type,
        signalEntities: signals,
        signalWeights,
        excludeEntities: Array.from(exclude),
        take: perType,
        sortBy: "affinity",
        explainability: true,
        biasTrends,
      }),
    ),
  );

  const merged = new Map<string, ExpandedEntity>();
  let failedDomains = 0;
  for (const result of settled) {
    if (result.status === "rejected") {
      failedDomains += 1;
      continue;
    }
    const domain = result.value.results.entities
      .map((entity) => ({ entity, affinity: clamp01(entity.affinity ?? 0) }))
      .sort((a, b) => b.affinity - a.affinity);
    for (const entry of domain) {
      if (merged.has(entry.entity.entity_id)) continue;
      merged.set(entry.entity.entity_id, {
        id: entry.entity.entity_id,
        name: entry.entity.name,
        type: shortType(entry.entity.type),
        affinity: entry.affinity,
        hops,
        via: hops === 2 ? params.bridgeNames?.[params.bridgeIds?.[0] ?? ""] : undefined,
      });
    }
  }

  if (failedDomains > 0) {
    warn(
      context,
      `${hops === 2 ? "Second-hop" : "Taste"} expansion unavailable for ${failedDomains} of ${DISCOVERY_TYPES.length} domains.`,
    );
  }

  const entities = Array.from(merged.values()).sort((a, b) => b.affinity - a.affinity);
  for (const entry of entities.slice(0, 4)) {
    context.sink?.({
      type: "expansion",
      entityType: entry.type,
      name: entry.name,
      affinityPct: Math.round(entry.affinity * 100),
      hops,
      via: hops === 2 ? params.bridgeNames?.[params.bridgeIds?.[0] ?? ""] : params.seedNames[params.signalIds[0]],
    });
  }

  return { entities, failedDomains };
}

/**
 * Score catalog items against the taste signal. Batched by entity type because
 * Qloo's `filter.results.entities` is typed; returns the top N with evidence.
 */
export async function toolScoreCatalog(
  params: {
    signalIds: string[];
    signalWeights?: number[];
    signalNames: Record<string, string>;
    candidates: { id: string; entityId: string; entityType: string; name: string; hops?: number; via?: string }[];
    mood?: "adventurous" | "grounded";
    take?: number;
  },
  context: ToolContext,
): Promise<{ scored: ScoredCandidate[]; apiScored: boolean }> {
  context.sink?.({
    type: "stage",
    stage: "score",
    label: "Scoring every candidate product against their taste",
    detail: `${params.candidates.length} products mapped to Qloo entities`,
  });

  const byType = new Map<string, { id: string; entityId: string; name: string; hops?: number; via?: string }[]>();
  for (const candidate of params.candidates) {
    const list = byType.get(candidate.entityType) ?? [];
    list.push(candidate);
    byType.set(candidate.entityType, list);
  }

  const affinity = new Map<string, number>();
  const scoredEntities = new Map<string, QlooEntity>();
  let apiScored = false;
  const biasTrends = params.mood === "adventurous" ? "mid" : params.mood === "grounded" ? "very_low" : undefined;

  const jobs: { type: string; chunk: { id: string; entityId: string; name: string; hops?: number; via?: string }[] }[] = [];
  for (const [type, list] of byType) {
    const unique = [...new Map(list.map((entry) => [entry.entityId, entry])).values()];
    for (let index = 0; index < unique.length; index += 50) {
      jobs.push({ type, chunk: unique.slice(index, index + 50) });
    }
  }

  await Promise.allSettled(
    jobs.map(async ({ type, chunk }) => {
      try {
        const response = await getInsights({
          filterType: type,
          signalEntities: params.signalIds,
          signalWeights: params.signalWeights,
          resultEntities: chunk.map((entry) => entry.entityId),
          take: chunk.length,
          sortBy: "affinity",
          explainability: true,
          biasTrends,
        });
        for (const entity of response.results.entities) {
          if (typeof entity.affinity === "number") {
            affinity.set(entity.entity_id, clamp01(entity.affinity));
            scoredEntities.set(entity.entity_id, entity);
            apiScored = true;
          }
        }
      } catch {
        warn(context, `Qloo scoring unavailable for ${shortType(type)} items.`);
      }
    }),
  );

  const fallbackNames = Object.values(params.signalNames);
  const fallbackContributors = fallbackNames.map((name) => ({
    name,
    sharePct: Math.round(100 / Math.max(fallbackNames.length, 1)),
  }));
  const scored: ScoredCandidate[] = params.candidates.map((candidate) => {
    const entity = scoredEntities.get(candidate.entityId);
    const signals = entity?.query?.explainability?.["signal.interests.entities"];
    const rawContributors = Array.isArray(signals)
      ? signals.flatMap((raw) => {
          if (!raw || typeof raw !== "object") return [];
          const record = raw as Record<string, unknown>;
          const id = typeof record.entity_id === "string" ? record.entity_id : "";
          const name = params.signalNames[id];
          const score = typeof record.score === "number" && record.score > 0 ? record.score : 0;
          return name ? [{ name, score }] : [];
        })
      : [];
    const total = rawContributors.reduce((sum, entry) => sum + entry.score, 0);
    const contributors = rawContributors.length > 0 && total > 0
      ? rawContributors.slice(0, 3).map((entry) => ({ name: entry.name, sharePct: Math.max(1, Math.round((entry.score / total) * 100)) }))
      : fallbackContributors;
    return {
      itemId: candidate.id,
      title: catalog.find((item) => item.id === candidate.id)?.title ?? candidate.name,
      category: catalog.find((item) => item.id === candidate.id)?.category ?? "Other",
      price: catalog.find((item) => item.id === candidate.id)?.price ?? 0,
      entityId: candidate.entityId,
      entityName: candidate.name,
      entityType: shortType(candidate.entityType),
      affinity: affinity.get(candidate.entityId) ?? 0.35,
      hops: candidate.hops,
      via: candidate.via,
      contributors,
    };
  });

  scored.sort((a, b) => b.affinity - a.affinity);
  return {
    scored: diverseDiscoveries(scored, (entry) => ({ id: entry.itemId, category: entry.category, entity: entry.entityId, affinity: entry.affinity }), params.take ?? 40),
    apiScored,
  };
}

export function describeCandidate(item: GiftItem): Record<string, unknown> {
  return {
    itemId: item.id,
    title: item.title,
    price: item.price,
    category: item.category,
    entity: item.entityName,
    affinityPct: item.affinityPct,
    via: item.matchedInterests,
  };
}

export function laneLabel(lane: LaneKey): string {
  return lane === "safe" ? "Safe bet" : lane === "surprise" ? "Wild card" : "The bundle";
}
