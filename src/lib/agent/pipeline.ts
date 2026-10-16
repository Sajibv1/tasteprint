import { catalog, type CatalogItem } from "@/lib/catalog";
import catalogEntityMap from "@/data/catalog-entities.json";
import { entityImageUrl, getInsights, searchEntities, QlooError, type InsightsOptions } from "@/lib/qloo/client";
import type { QlooEntity } from "@/lib/qloo/types";
import { buildLaneExplanations, itemReason, defaultHeadline } from "./explain";
import type {
  Contributor,
  GiftItem,
  GiftPick,
  InterestAlternate,
  InterestInput,
  LaneKey,
  ProgressSink,
  RecommendRequest,
  RecommendResult,
  SessionConstraints,
  StageName,
  TasteConnection,
  TasteMapEntry,
} from "./types";

const INTEREST_SEARCH_TYPES = [
  "urn:entity:artist",
  "urn:entity:movie",
  "urn:entity:tv_show",
  "urn:entity:book",
  "urn:entity:podcast",
  "urn:entity:person",
  "urn:entity:videogame",
  "urn:entity:brand",
];

const DISCOVERY_TYPES = ["urn:entity:artist", "urn:entity:brand", "urn:entity:book", "urn:entity:movie"];

interface ResolvedInterest {
  input: string;
  entity: QlooEntity;
  alternates: InterestAlternate[];
  candidates: InterestAlternate[];
}

interface ExpansionEntry {
  entity: QlooEntity;
  affinity: number;
  hops: 1 | 2;
  originId?: string;
  via?: { from: string; hopName: string };
}

interface ScoredItem {
  item: CatalogItem;
  entity: QlooEntity;
  affinity: number;
  origin: "api" | "direct" | "expansion" | "heuristic";
  source: "direct" | "discovery" | "adjacent";
  matchedInterests: string[];
  contributors?: Contributor[];
  hops?: number;
}

interface NormalizedConstraints {
  budgetMin?: number;
  budgetMax?: number;
  avoidItemIds: Set<string>;
  priorItemIds: Set<string>;
  boost: Set<string>;
  mute: Set<string>;
  mood?: "adventurous" | "grounded";
}

const catalogEntityCache = new Map<string, QlooEntity>();

const STATIC_ENTITY_MAP = catalogEntityMap as Record<string, { entity_id: string; name: string; type: string; image?: string }>;

const RECENT_WILDCARD_TTL_MS = 30 * 60 * 1000;
const RECENT_PICK_TTL_MS = 10 * 60 * 1000;
const recentlyPicked = new Map<string, number>();
const recentWildcardFeatures = new Map<string, { ts: number; categories: string; brands: string }>();

function markPicked(ids: string[]): void {
  const now = Date.now();
  for (const id of ids) recentlyPicked.set(id, now);
  if (recentlyPicked.size > 600) {
    const maxTtl = Math.max(RECENT_WILDCARD_TTL_MS, RECENT_PICK_TTL_MS);
    for (const [id, ts] of recentlyPicked) {
      if (now - ts > maxTtl) recentlyPicked.delete(id);
    }
  }
}

function markWildcard(entries: ScoredItem[]): void {
  const now = Date.now();
  const categories = JSON.stringify(entries.map((entry) => entry.item.category).sort());
  const brands = JSON.stringify(entries.map((entry) => entry.item.brand.toLowerCase()).sort());
  recentWildcardFeatures.set("latest", { ts: now, categories, brands });
}

function wildcardFeaturePenalty(entry: ScoredItem): number {
  const record = recentWildcardFeatures.get("latest");
  if (!record || Date.now() - record.ts > RECENT_WILDCARD_TTL_MS) return 1;
  const entityBrand = entry.item.brand.toLowerCase();
  if (JSON.parse(record.categories).includes(entry.item.category)) return 0.6;
  if (JSON.parse(record.brands).includes(entityBrand)) return 0.6;
  return 1;
}

function wasRecentlyPicked(id: string, ttl: number): boolean {
  const ts = recentlyPicked.get(id);
  return ts !== undefined && Date.now() - ts <= ttl;
}

function recencyDamp(id: string, factor: number): number {
  return wasRecentlyPicked(id, RECENT_PICK_TTL_MS) ? factor : 1;
}

function shortType(type: string): string {
  return type.replace(/^urn:entity:/, "").replace(/_/g, " ");
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function popularityOf(entity: QlooEntity): number {
  if (typeof entity.popularity === "number") return entity.popularity;
  const property = entity.properties?.popularity;
  return typeof property === "number" ? property : 0;
}

function normalizeConstraints(raw?: Partial<SessionConstraints>): NormalizedConstraints {
  const lower = (list?: string[]) =>
    new Set((list ?? []).map((entry) => entry.toLowerCase().trim()).filter((entry) => entry.length > 0));
  const mood = raw?.mood === "adventurous" || raw?.mood === "grounded" ? raw.mood : undefined;
  return {
    budgetMin: raw?.budgetMin,
    budgetMax: raw?.budgetMax,
    avoidItemIds: new Set(raw?.avoidItemIds ?? []),
    priorItemIds: new Set(raw?.priorItemIds ?? []),
    boost: lower(raw?.boostInterests),
    mute: lower(raw?.muteInterests),
    mood,
  };
}

function pushWarning(warnings: string[], sink: ProgressSink | undefined, message: string): void {
  warnings.push(message);
  sink?.({ type: "warning", message });
}

function stage(sink: ProgressSink | undefined, name: StageName, label: string, detail?: string): void {
  sink?.({ type: "stage", stage: name, label, detail: detail && detail.length > 0 ? detail : undefined });
}

function sanitizeBudget(raw: RecommendRequest["budget"]): { min: number; max: number } {
  let min = Number.isFinite(raw?.min) ? Math.max(0, Math.round(raw?.min ?? 0)) : 0;
  let max = Number.isFinite(raw?.max) ? Math.max(0, Math.round(raw?.max ?? 100)) : 100;
  if (min > max) [min, max] = [max, min];
  max = Math.min(Math.max(max, 5), 10_000);
  min = Math.min(min, max);
  return { min, max };
}

const INTEREST_TYPE_BY_SHORT = new Map(INTEREST_SEARCH_TYPES.map((type) => [type.replace(/^urn:entity:/, ""), type]));

function normalizeInterestEntry(raw: unknown): InterestInput | null {
  let name = "";
  let type: string | undefined;
  if (typeof raw === "string") {
    name = raw;
  } else if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    if (typeof record.name === "string") name = record.name;
    if (typeof record.type === "string") {
      const cleaned = record.type.trim().toLowerCase();
      type = INTEREST_TYPE_BY_SHORT.get(cleaned) ?? INTEREST_TYPE_BY_SHORT.get(cleaned.replace(/^urn:entity:/, ""));
    }
  }
  name = name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (name.length < 1) return null;
  return { name, type };
}

function normalizeInterests(raw: unknown): InterestInput[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: InterestInput[] = [];
  for (const entry of raw) {
    const parsed = normalizeInterestEntry(entry);
    if (!parsed) continue;
    const key = parsed.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed);
    if (out.length >= 8) break;
  }
  return out;
}

async function resolveInterests(
  inputs: InterestInput[],
  warnings: string[],
  sink: ProgressSink | undefined,
): Promise<ResolvedInterest[]> {
  stage(sink, "resolve", "Resolving interests against Qloo's entity index", inputs.map((entry) => entry.name).join(" · "));
  const settled = await Promise.allSettled(
    inputs.map(async ({ name, type }) => {
      let requestedType = type;
      let entities = await searchEntities(name, { types: type ? [type] : INTEREST_SEARCH_TYPES, take: type ? 5 : 8 });
      let sameName = entities.filter((entity) => entity.name.toLowerCase() === name.toLowerCase());
      if (type && sameName.length === 0) {
        entities = await searchEntities(name, { types: INTEREST_SEARCH_TYPES, take: 8 });
        sameName = entities.filter((entity) => entity.name.toLowerCase() === name.toLowerCase());
        requestedType = undefined;
      }
      const entity =
        [...sameName].sort((a, b) => popularityOf(b) - popularityOf(a))[0] ??
        [...entities].sort((a, b) => popularityOf(b) - popularityOf(a))[0];
      if (!entity) throw new Error(`No Qloo match for "${name}"`);

      const alternates: InterestAlternate[] = [];
      const seenTypes = new Set<string>([entity.type]);
      for (const candidate of sameName) {
        if (seenTypes.has(candidate.type)) continue;
        seenTypes.add(candidate.type);
        alternates.push({ type: candidate.type, name: candidate.name, popularity: popularityOf(candidate) });
      }
      alternates.sort((a, b) => b.popularity - a.popularity);

      const candidates: InterestAlternate[] = [];
      if (sameName.length === 0) {
        const seenIds = new Set<string>([entity.entity_id]);
        for (const candidate of entities) {
          if (seenIds.has(candidate.entity_id)) continue;
          seenIds.add(candidate.entity_id);
          candidates.push({ type: candidate.type, name: candidate.name, popularity: popularityOf(candidate) });
          if (candidates.length >= 3) break;
        }
      }
      return { input: name, entity, alternates: alternates.slice(0, 3), candidates, exact: sameName.length > 0, overrideDropped: Boolean(type) && !requestedType };
    }),
  );

  const resolved: ResolvedInterest[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      const value = result.value;
      let note: string | undefined;
      if (value.overrideDropped) {
        note = `no ${shortType(inputs[index].type ?? "")} found — matched as ${shortType(value.entity.type)}`;
        pushWarning(warnings, sink, `No ${shortType(inputs[index].type ?? "")} named "${inputs[index].name}" — matched as ${shortType(value.entity.type)} instead.`);
      } else if (!value.exact) {
        note = "closest match used";
        pushWarning(warnings, sink, `No exact Qloo match for "${inputs[index].name}" — using "${value.entity.name}" (${shortType(value.entity.type)}).`);
      }
      sink?.({ type: "interest", input: value.input, matchedName: value.entity.name, entityType: shortType(value.entity.type), note });
      resolved.push(value);
    } else {
      pushWarning(warnings, sink, `Could not match "${inputs[index].name}" to a Qloo entity — skipped.`);
    }
  });

  if (resolved.length === 0) {
    const infraFailure = settled.find(
      (result) =>
        result.status === "rejected" &&
        result.reason instanceof QlooError &&
        [401, 403, 429, 500].includes(result.reason.status),
    );
    if (infraFailure && infraFailure.status === "rejected") {
      warnings.length = 0;
      throw infraFailure.reason;
    }
  }
  return resolved;
}

function biasTrendsFor(constraints: NormalizedConstraints): InsightsOptions["biasTrends"] | undefined {
  if (constraints.mood === "adventurous") return "mid";
  if (constraints.mood === "grounded") return "very_low";
  return undefined;
}

function paddedWeights(signalWeights: number[] | undefined, signalCount: number): number[] | undefined {
  if (!signalWeights || signalWeights.length === 0) return undefined;
  return [...signalWeights.slice(0, signalCount), ...Array(Math.max(0, signalCount - signalWeights.length)).fill(1)];
}

function topInfluence(influence: Map<string, number>, allowedIds: string[]): string | undefined {
  let best: { id: string; score: number } | undefined;
  for (const [id, score] of influence) {
    if (!allowedIds.includes(id)) continue;
    if (!best || score > best.score) best = { id, score };
  }
  return best?.id;
}

async function expandTaste(params: {
  signalIds: string[];
  signalWeights: number[] | undefined;
  resolvedNameById: Map<string, string>;
  constraints: NormalizedConstraints;
  warnings: string[];
  sink: ProgressSink | undefined;
}): Promise<Map<string, ExpansionEntry>> {
  const { signalIds, signalWeights, resolvedNameById, constraints, warnings, sink } = params;
  const biasTrends = biasTrendsFor(constraints);
  const expansion = new Map<string, ExpansionEntry>();
  const directIds = [...signalIds];

  const callInsights = async (filterType: string, signals: string[], take: number, exclude: string[]) =>
    getInsights({
      filterType,
      signalEntities: signals,
      signalWeights: paddedWeights(signalWeights, signals.length),
      excludeEntities: exclude,
      take,
      sortBy: "affinity",
      explainability: true,
      biasTrends,
    });

  stage(sink, "expand", "Expanding taste across music, brands, books and film", `${signalIds.length} seed signal${signalIds.length === 1 ? "" : "s"} · four discovery domains`);

  const hop1Settled = await Promise.allSettled(DISCOVERY_TYPES.map((type) => callInsights(type, signalIds, 25, directIds)));

  for (const result of hop1Settled) {
    if (result.status === "rejected") continue;
    const response = result.value;
    const influence = extractSignalInfluence(response.query);
    const responseOriginId = topInfluence(influence, directIds);
    const domain = response.results.entities
      .map((entity) => ({ entity, affinity: clamp01(entity.affinity ?? 0) }))
      .sort((a, b) => b.affinity - a.affinity);
    for (const entry of domain.slice(0, 2)) {
      sink?.({ type: "expansion", entityType: shortType(entry.entity.type), name: entry.entity.name, affinityPct: Math.round(entry.affinity * 100), hops: 1 });
    }
    for (const entry of domain) {
      if (expansion.has(entry.entity.entity_id)) continue;
      expansion.set(entry.entity.entity_id, { entity: entry.entity, affinity: entry.affinity, hops: 1, originId: responseOriginId });
    }
  }
  const hop1Failures = hop1Settled.filter((result) => result.status === "rejected").length;
  if (hop1Failures > 0) {
    pushWarning(warnings, sink, `Taste expansion unavailable for ${hop1Failures} of ${DISCOVERY_TYPES.length} domains.`);
  }

  const bridges = Array.from(expansion.values())
    .filter((entry) => entry.hops === 1 && entry.affinity >= 0.25)
    .sort((a, b) => b.affinity - a.affinity)
    .slice(0, 6);
  const bridgeIds = bridges.map((entry) => entry.entity.entity_id);

  if (bridgeIds.length > 0) {
    stage(sink, "hop2", "Second hop — chasing connections through the newly discovered taste", `${bridgeIds.length} bridges: ${bridges.slice(0, 3).map((entry) => entry.entity.name).join(", ")}${bridges.length > 3 ? "…" : ""}`);
    const hop2Settled = await Promise.allSettled(
      DISCOVERY_TYPES.map((type) => callInsights(type, [...signalIds, ...bridgeIds], 20, [...directIds, ...bridgeIds])),
    );
    for (const result of hop2Settled) {
      if (result.status === "rejected") continue;
      const response = result.value;
      const influence = extractSignalInfluence(response.query);
      const bridgeById = new Map(bridges.map((candidate) => [candidate.entity.entity_id, candidate]));

      const candidates = response.results.entities
        .filter((entity) => !expansion.has(entity.entity_id))
        .map((entity) => ({ entity, affinity: clamp01(entity.affinity ?? 0), influence }))
        .sort((a, b) => b.affinity - a.affinity);
      for (const entry of candidates.slice(0, 2)) {
        const chosen = candidateBridge(entry, bridgeById, bridgeIds, bridges);
        sink?.({
          type: "expansion",
          entityType: shortType(entry.entity.type),
          name: entry.entity.name,
          affinityPct: Math.round(entry.affinity * 100),
          hops: 2,
          via: chosen?.entity.name,
        });
      }
      for (const entry of candidates) {
        const chosen = candidateBridge(entry, bridgeById, bridgeIds, bridges) ?? bridges[0];
        if (!chosen) continue;
        const from = chosen.originId ? resolvedNameById.get(chosen.originId) : undefined;
        expansion.set(entry.entity.entity_id, {
          entity: entry.entity,
          affinity: entry.affinity,
          hops: 2,
          originId: chosen.entity.entity_id,
          via: from ? { from, hopName: chosen.entity.name } : undefined,
        });
      }
    }
    const hop2Failures = hop2Settled.filter((result) => result.status === "rejected").length;
    if (hop2Failures === DISCOVERY_TYPES.length && hop1Failures === 0) {
      pushWarning(warnings, sink, "Second-hop expansion failed on all domains — drawing from first-hop discoveries only.");
    }
  }

  return expansion;
}

function candidateBridge(
  entry: { influence: Map<string, number> },
  bridgeById: Map<string, ExpansionEntry>,
  bridgeIds: string[],
  bridges: ExpansionEntry[],
): ExpansionEntry | undefined {
  const top = Array.from(entry.influence.entries())
    .filter(([id]) => bridgeIds.includes(id) || bridgeById.has(id))
    .sort((a, b) => b[1] - a[1])[0]?.[0];
  return top ? bridgeById.get(top) ?? bridges[0] : bridges[0];
}

let catalogResolution: Promise<void> | null = null;

interface CatalogResolutionContext {
  expansion?: Map<string, ExpansionEntry>;
  resolvedInterests?: ResolvedInterest[];
  sink?: ProgressSink;
}

const refKey = (type: string, name: string) => `${type}|${name.toLowerCase()}`;

async function resolveCatalogEntities(context: CatalogResolutionContext = {}): Promise<Map<string, QlooEntity>> {
  // Build-time mapping first: pre-resolved entity IDs for the whole catalog,
  // so a cold start doesn't pay ~170 entity searches.
  for (const item of catalog) {
    if (catalogEntityCache.has(item.id)) continue;
    const mapped = STATIC_ENTITY_MAP[item.id];
    if (mapped?.entity_id) {
      catalogEntityCache.set(item.id, {
        entity_id: mapped.entity_id,
        name: mapped.name,
        type: mapped.type,
        properties: mapped.image ? { image: { url: mapped.image } } : undefined,
      } as QlooEntity);
    }
  }
  const freeHits = new Map<string, QlooEntity>();
  for (const entry of context.expansion?.values() ?? []) {
    freeHits.set(refKey(entry.entity.type, entry.entity.name), entry.entity);
  }
  for (const entry of context.resolvedInterests ?? []) {
    freeHits.set(refKey(entry.entity.type, entry.entity.name), entry.entity);
    freeHits.set(refKey(entry.entity.type, entry.input), entry.entity);
  }
  for (const item of catalog) {
    if (catalogEntityCache.has(item.id)) continue;
    const hit = freeHits.get(refKey(item.qloo.type, item.qloo.query));
    if (hit) catalogEntityCache.set(item.id, hit);
  }

  if (!catalogResolution) {
    catalogResolution = (async () => {
      const pending = catalog.filter((item) => !catalogEntityCache.has(item.id));
      await Promise.allSettled(
        pending.map(async (item) => {
          try {
            const entities = await searchEntities(item.qloo.query, { types: [item.qloo.type], take: 5 });
            const normalized = item.qloo.query.toLowerCase().replace(/[\u2018\u2019]/g, "'").trim();
            const ranked = [...entities].sort((a, b) => popularityOf(b) - popularityOf(a));
            const exact = ranked.find((entity) => entity.name.toLowerCase() === normalized);
            const strong = ranked.find((entity) => popularityOf(entity) >= 0.1);
            const entity = exact ?? strong ?? ranked[0];
            if (entity) catalogEntityCache.set(item.id, entity);
          } catch {
            context.sink?.({ type: "warning", message: `Catalog entity resolution failed for "${item.title}".` });
          }
        }),
      );
    })();
  }
  await catalogResolution;

  if (catalogEntityCache.size === 0) {
    throw new QlooError(502, "Could not resolve any catalog items against Qloo. Check the API key and try again.");
  }
  return catalogEntityCache;
}

export function warmCatalog(): void {
  void resolveCatalogEntities().catch(() => {});
}

const UUID_KEY = /^[0-9a-fA-F-]{32,40}$/;

function mergeInfluence(target: Map<string, number>, source: Map<string, number>): void {
  for (const [key, value] of source) {
    target.set(key, Math.max(target.get(key) ?? 0, value));
  }
}

function extractSignalInfluence(query: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (!query || typeof query !== "object") return out;
  const explainability = (query as Record<string, unknown>).explainability;
  if (!explainability) return out;

  const firstNumber = (record: Record<string, unknown>): number | undefined => {
    for (const key of ["score", "avg_score", "weight", "impact", "influence", "contribution", "affinity"]) {
      const value = record[key];
      if (typeof value === "number") return value;
    }
    return undefined;
  };

  const visit = (node: unknown, depth: number): void => {
    if (depth > 5 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const entry of node) visit(entry, depth + 1);
      return;
    }
    const record = node as Record<string, unknown>;
    const id = typeof record.entity_id === "string" ? record.entity_id : typeof record.id === "string" ? record.id : undefined;
    if (id) {
      const score = firstNumber(record);
      if (score !== undefined) out.set(id, Math.max(out.get(id) ?? 0, score));
    }
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === "number" && UUID_KEY.test(key)) {
        out.set(key, Math.max(out.get(key) ?? 0, value));
      } else if (value !== null && typeof value === "object") {
        visit(value, depth + 1);
      }
    }
  };

  visit(explainability, 0);
  return out;
}

function heuristicAffinity(entity: QlooEntity, resolved: ResolvedInterest[]): number {
  const typeOverlap = resolved.some((entry) => entry.entity.type === entity.type);
  return typeOverlap ? 0.6 : 0.3;
}

function contributorShares(
  entity: QlooEntity,
  nameById: Map<string, string>,
  viaById: Map<string, string>,
  fallbackNames: string[],
): Contributor[] {
  const entries: { name: string; via?: string; score: number }[] = [];
  const signals = entity.query?.explainability?.["signal.interests.entities"];
  if (Array.isArray(signals)) {
    for (const raw of signals) {
      if (typeof raw !== "object" || raw === null) continue;
      const record = raw as Record<string, unknown>;
      const id = typeof record.entity_id === "string" ? record.entity_id : "";
      const score = typeof record.score === "number" ? record.score : 0;
      const name = nameById.get(id);
      if (name) entries.push({ name, via: viaById.get(id), score });
    }
  }
  if (entries.length === 0) {
    entries.push(...fallbackNames.map((name) => ({ name, score: 1 })));
  }
  entries.sort((a, b) => b.score - a.score);
  const top = entries.slice(0, 3);
  const total = top.reduce((sum, entry) => sum + entry.score, 0);
  if (top.length === 0 || total <= 0) return [];
  const seen = new Set<string>();
  const out: Contributor[] = [];
  for (const entry of top) {
    const key = `${entry.name}|${entry.via ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: entry.name, via: entry.via, sharePct: Math.max(1, Math.round((entry.score / total) * 100)) });
  }
  return out;
}

function weightNudge(names: string[], constraints: NormalizedConstraints): number {
  let boosted = 0;
  let muted = 0;
  for (const name of names) {
   const key = name.toLowerCase();
    if (constraints.boost.has(key)) boosted += 1;
    if (constraints.mute.has(key)) muted += 1;
  }
  let multiplier = 1 + 0.15 * Math.min(boosted, 2);
  if (muted > 0) multiplier *= muted >= Math.max(1, names.length) ? 0.75 : 0.9;
  return multiplier;
}

async function scoreCatalog(params: {
  catalogEntities: Map<string, QlooEntity>;
  signalIds: string[];
  signalWeights: number[] | undefined;
  resolved: ResolvedInterest[];
  expansion: Map<string, ExpansionEntry>;
  constraints: NormalizedConstraints;
  warnings: string[];
  sink: ProgressSink | undefined;
}): Promise<ScoredItem[]> {
  const { catalogEntities, signalIds, signalWeights, resolved, expansion, constraints, warnings, sink } = params;
  const directIds = new Set(resolved.map((entry) => entry.entity.entity_id));
  const directNameById = new Map(resolved.map((entry) => [entry.entity.entity_id, entry.input]));

  const bridgeEntries = Array.from(expansion.values()).filter((entry) => entry.hops === 1);
  const bridgeNameById = new Map(bridgeEntries.map((entry) => [entry.entity.entity_id, entry.entity.name] as const));
  const viaById = new Map<string, string>();
  for (const entry of bridgeEntries) {
    const origin = entry.originId ? directNameById.get(entry.originId) : undefined;
    if (origin) viaById.set(entry.entity.entity_id, origin);
  }
  const nameById = new Map<string, string>([...directNameById, ...bridgeNameById]);

  const byType = new Map<string, string[]>();
  for (const item of catalog) {
    const entity = catalogEntities.get(item.id);
    if (!entity) continue;
    const ids = byType.get(entity.type) ?? [];
    ids.push(entity.entity_id);
    byType.set(entity.type, ids);
  }

  const apiAffinity = new Map<string, number>();
  const apiEntities = new Map<string, QlooEntity>();
  const influence = new Map<string, number>();
  let anyApiScore = false;

  const jobs: { type: string; chunk: string[] }[] = [];
  for (const [type, rawIds] of byType) {
    const ids = Array.from(new Set(rawIds));
    for (let index = 0; index < ids.length; index += 50) {
      jobs.push({ type, chunk: ids.slice(index, index + 50) });
    }
  }
  await Promise.allSettled(
    jobs.map(async ({ type, chunk }) => {
      try {
        const response = await getInsights({
          filterType: type,
          signalEntities: signalIds,
          signalWeights,
          resultEntities: chunk,
          take: chunk.length,
          sortBy: "affinity",
          explainability: true,
          biasTrends: biasTrendsFor(constraints),
        });
        for (const entity of response.results.entities) {
          if (typeof entity.affinity === "number") {
            apiAffinity.set(entity.entity_id, clamp01(entity.affinity));
            if (!apiEntities.has(entity.entity_id)) apiEntities.set(entity.entity_id, entity);
            anyApiScore = true;
          }
        }
        mergeInfluence(influence, extractSignalInfluence(response.query));
      } catch {
        pushWarning(warnings, sink, `Qloo scoring unavailable for ${shortType(type)} items.`);
      }
    }),
  );

  const scored: ScoredItem[] = [];
  for (const item of catalog) {
    const entity = catalogEntities.get(item.id);
    if (!entity) continue;
    // Prefer the API-scored entity: it carries per-item explainability
    // (query.explainability) so contributor shares are evidence, not fallback.
    const scoredEntity = apiEntities.get(entity.entity_id) ?? entity;
    const isDirect = directIds.has(entity.entity_id);
    const expansionEntry = expansion.get(entity.entity_id);
    const apiScore = apiAffinity.get(entity.entity_id);
    const rawAffinity =
      apiScore ??
      (isDirect ? 0.9 : expansionEntry ? expansionEntry.affinity : heuristicAffinity(entity, resolved));
    const origin: ScoredItem["origin"] = apiScore !== undefined ? "api" : isDirect ? "direct" : expansionEntry ? "expansion" : "heuristic";

    const baseNames = isDirect
      ? [(directNameById.get(entity.entity_id) ?? entity.name)]
      : expansionEntry?.via?.from
        ? [expansionEntry.via.from]
        : [];
    const contributors = contributorShares(scoredEntity, nameById, viaById, baseNames.length > 0 ? baseNames : resolved.slice(0, 3).map((entry) => entry.input));
    const namesForWeight = Array.from(
      new Set([...baseNames, ...contributors.flatMap((entry) => [entry.name, entry.via ?? ""].filter(Boolean))]),
    );
    const appliedAffinity = Math.min(0.97, rawAffinity * (namesForWeight.length > 0 ? weightNudge(namesForWeight, constraints) : 1));
    const matchedInterests =
      contributors.length > 0
        ? contributorNames(contributors)
        : baseNames.length > 0
          ? baseNames
          : resolved.slice(0, 3).map((entry) => entry.input);
    const source: ScoredItem["source"] = isDirect ? "direct" : expansionEntry ? "discovery" : "adjacent";
    scored.push({ item, entity: scoredEntity, affinity: appliedAffinity, origin, source, matchedInterests, contributors: contributors.length > 0 ? contributors : undefined, hops: expansionEntry?.hops });
  }

  if (!anyApiScore) {
    pushWarning(warnings, sink, "Qloo scoring calls returned nothing usable — showing fallback match strengths.");
  }
  return scored;
}

function contributorNames(contributors: Contributor[]): string[] {
  return contributors.map((entry) => entry.name);
}

const stockRank = (inventory: CatalogItem["inventory"]): number =>
  inventory === "in_stock" ? 2 : inventory === "low_stock" ? 1 : 0;

function sortByAffinity(list: ScoredItem[]): ScoredItem[] {
  return [...list].sort((a, b) => {
    const diff = b.affinity - a.affinity;
    if (Math.abs(diff) > 0.001) return diff;
    const stock = stockRank(b.item.inventory) - stockRank(a.item.inventory);
    if (stock !== 0) return stock;
    return a.item.price - b.item.price;
  });
}

function safeScore(entry: ScoredItem): number {
  const pop = popularityOf(entry.entity);
  return entry.affinity * (1 + 0.02 * pop) + 0.008 * stockRank(entry.item.inventory);
}

function itemSimilarity(a: ScoredItem, b: ScoredItem): number {
  let value = 0;
  if (a.item.category === b.item.category) value += 0.45;
  if (a.entity.type === b.entity.type) value += 0.25;
  if (a.item.brand.toLowerCase() === b.item.brand.toLowerCase()) value += 0.3;
  return Math.min(1, value);
}

function pickSafe(pool: ScoredItem[], blocked: Set<string>): ScoredItem | undefined {
  const eligible = pool.filter((entry) => !blocked.has(entry.item.id));
  if (eligible.length === 0) return undefined;
  const damp = (entry: ScoredItem) => safeScore(entry) * recencyDamp(entry.item.id, 0.92);
  const direct = eligible.filter((entry) => entry.source === "direct").sort((a, b) => damp(b) - damp(a));
  const chosen = direct[0] ?? [...eligible].sort((a, b) => damp(b) - damp(a))[0];
  if (!chosen) return undefined;
  blocked.add(chosen.item.id);
  return chosen;
}

function surpriseScore(entry: ScoredItem, signalTypeSet: Set<string>): number {
  const pop = popularityOf(entry.entity);
  let value = entry.affinity * (0.9 + 0.1 * (1 - pop));
  if (!signalTypeSet.has(entry.entity.type)) value *= 1.04;
  if (entry.source === "discovery") value *= 1.18;
  if (entry.hops === 2) value *= 1.1;
  value *= wildcardFeaturePenalty(entry);
  return value;
}

function surpriseMmrScore(entry: ScoredItem, signalTypeSet: Set<string>, context: ScoredItem[]): number {
  const maxSim = context.length > 0 ? Math.max(...context.map((other) => itemSimilarity(entry, other))) : 0;
  const base = 0.7 * surpriseScore(entry, signalTypeSet) - 0.3 * maxSim;
  return base * recencyDamp(entry.item.id, 0.85);
}

function pickSurprise(
  pool: ScoredItem[],
  blocked: Set<string>,
  blockedEntities: Set<string>,
  signalTypeSet: Set<string>,
  safeCategory: string | undefined,
  gamingSignaled: boolean,
  contextItems: ScoredItem[],
  minAffinity: number,
): ScoredItem | undefined {
  const eligible = pool.filter(
    (entry) =>
      !blocked.has(entry.item.id) &&
      !blockedEntities.has(entry.entity.entity_id) &&
      entry.source !== "direct" &&
      entry.affinity >= minAffinity &&
      !wasRecentlyPicked(entry.item.id, RECENT_WILDCARD_TTL_MS),
  );
  if (eligible.length === 0) {
    const relaxation = Math.min(minAffinity, 0.12);
    const fallback = pool.filter(
      (entry) =>
        !blocked.has(entry.item.id) &&
        !blockedEntities.has(entry.entity.entity_id) &&
        entry.affinity >= relaxation &&
        !wasRecentlyPicked(entry.item.id, RECENT_WILDCARD_TTL_MS),
    );
    const lastResort = pool.filter(
      (entry) => !blocked.has(entry.item.id) && !blockedEntities.has(entry.entity.entity_id) && entry.affinity >= relaxation,
    );
    const chosen = [...(fallback.length > 0 ? fallback : lastResort)].sort(
      (a, b) => surpriseScore(b, signalTypeSet) - surpriseScore(a, signalTypeSet),
    )[0];
    if (chosen) blocked.add(chosen.item.id);
    return chosen;
  }
  const strict = eligible.filter(
    (entry) => entry.item.category !== safeCategory && (gamingSignaled || entry.entity.type !== "urn:entity:videogame"),
  );
  const ranked = (strict.length > 0 ? strict : eligible).sort(
    (a, b) => surpriseMmrScore(b, signalTypeSet, contextItems) - surpriseMmrScore(a, signalTypeSet, contextItems),
  );
  const chosen = ranked[0];
  if (chosen) blocked.add(chosen.item.id);
  return chosen;
}

function bundleSetScore(set: ScoredItem[]): number {
  const categories = new Set(set.map((entry) => entry.item.category));
  const types = new Set(set.map((entry) => entry.entity.type));
  const brands = new Set(set.map((entry) => entry.item.brand.toLowerCase()));
  const totalAffinity = set.reduce((sum, entry) => sum + entry.affinity, 0);
  const recency = set.reduce((product, entry) => product * recencyDamp(entry.item.id, 0.92), 1);
  return (
    (totalAffinity +
      0.22 * Math.max(categories.size - 1, 0) +
      0.12 * Math.max(types.size - 1, 0) +
      0.08 * brands.size +
      0.25 * (set.length - 1)) *
    recency
  );
}

function greedyBundle(first: ScoredItem, candidates: ScoredItem[], budgetMax: number): ScoredItem[] {
  const chosen: ScoredItem[] = [first];
  const categories = new Set<string>([first.item.category]);
  const entities = new Set<string>([first.entity.entity_id]);
  let total = first.item.price;
  const rest = candidates.filter((entry) => entry.item.id !== first.item.id && !entities.has(entry.entity.entity_id));

  for (const candidate of rest) {
    if (chosen.length >= 3) break;
    if (categories.has(candidate.item.category) || entities.has(candidate.entity.entity_id)) continue;
    if (total + candidate.item.price > budgetMax) continue;
    chosen.push(candidate);
    categories.add(candidate.item.category);
    entities.add(candidate.entity.entity_id);
    total += candidate.item.price;
  }

  if (chosen.length < 3) {
    for (const candidate of rest) {
      if (chosen.length >= 3) break;
      if (entities.has(candidate.entity.entity_id) || chosen.some((entry) => entry.item.id === candidate.item.id)) continue;
      if (total + candidate.item.price > budgetMax) continue;
      chosen.push(candidate);
      entities.add(candidate.entity.entity_id);
      total += candidate.item.price;
    }
  }
  return chosen;
}

function pickBundle(
  pool: ScoredItem[],
  budgetMax: number,
  blocked: Set<string>,
  blockedEntities: Set<string>,
  minAffinity: number,
): ScoredItem[] {
  const ranked = sortByAffinity(
    pool.filter((entry) => !blocked.has(entry.item.id) && !blockedEntities.has(entry.entity.entity_id)),
  );
  const candidates = ranked.slice(0, 26);
  if (candidates.length === 0) return [];

  let best: ScoredItem[] = [];
  let bestScore = -1;
  const affinityOk = (set: ScoredItem[]) => Math.min(...set.map((entry) => entry.affinity)) >= minAffinity;

  for (let i = 0; i < candidates.length; i += 1) {
    const first = candidates[i];
    if (first.item.price > budgetMax) continue;
    const pairRest = [...candidates.slice(i + 1)];
    for (const second of pairRest) {
      if (first.item.price + second.item.price > budgetMax) continue;
      const pair = [first, second];
      if (affinityOk(pair)) {
        const score = bundleSetScore(pair);
        if (score > bestScore) {
          best = pair;
          bestScore = score;
        }
      }
      for (const third of pairRest.slice(pairRest.indexOf(second) + 1)) {
        if (first.item.price + second.item.price + third.item.price > budgetMax) continue;
        const triple = [first, second, third];
        if (!affinityOk(triple)) continue;
        const score = bundleSetScore(triple);
        if (score > bestScore) {
          best = triple;
          bestScore = score;
        }
      }
    }
  }

  if (best.length < 2) {
    return greedyBundle(candidates[0], ranked, budgetMax);
  }
  for (const entry of best) blocked.add(entry.item.id);
  return best;
}

function selectLanes(
  pool: ScoredItem[],
  budgetMax: number,
  signalTypeSet: Set<string>,
  minSurpriseAffinity: number,
  minBundleAffinity: number,
): { lanes: { lane: LaneKey; items: ScoredItem[] }[]; bundleBuilt: boolean } {
  const blocked = new Set<string>();
  const blockedEntities = new Set<string>();
  const lanes: { lane: LaneKey; items: ScoredItem[] }[] = [];

  const safe = pickSafe(pool, blocked);
  if (safe) {
    blockedEntities.add(safe.entity.entity_id);
    lanes.push({ lane: "safe", items: [safe] });
  }

  const surprise = pickSurprise(
    pool,
    blocked,
    blockedEntities,
    signalTypeSet,
    safe?.item.category,
    signalTypeSet.has("urn:entity:videogame"),
    safe ? [safe] : [],
    minSurpriseAffinity,
  );
  if (surprise) {
    blockedEntities.add(surprise.entity.entity_id);
    lanes.push({ lane: "surprise", items: [surprise] });
  }

  const bundleItems = pickBundle(pool, budgetMax, blocked, blockedEntities, minBundleAffinity);
  if (bundleItems.length >= 2) {
    lanes.push({ lane: "bundle", items: bundleItems });
  }

  return { lanes, bundleBuilt: lanes.some((entry) => entry.lane === "bundle") };
}

function buildLanes(
  pool: ScoredItem[],
  budgetMax: number,
  signalTypeSet: Set<string>,
  warnings: string[],
  sink: ProgressSink | undefined,
): { lanes: { lane: LaneKey; items: ScoredItem[] }[]; bundleBuilt: boolean } {
  const isReal = (entry: ScoredItem) => entry.origin !== "heuristic";
  if (pool.every(isReal) || pool.filter(isReal).length < 6) {
    return selectLanes(pool, budgetMax, signalTypeSet, 0.12, 0.2);
  }

  const gated = pool.filter(isReal);
  const strictOutcome = selectLanes(gated, budgetMax, signalTypeSet, 0.3, 0.26);
  if (strictOutcome.lanes.length >= 3) {
    return strictOutcome;
  }

  const relaxedOutcome = selectLanes(pool, budgetMax, signalTypeSet, 0.12, 0.2);
  if (relaxedOutcome.lanes.length > strictOutcome.lanes.length) {
    pushWarning(warnings, sink, "Relevance gate was strict for this run — widened it to fill every lane; some picks come from shallower matches.");
    return relaxedOutcome;
  }
  return { lanes: strictOutcome.lanes, bundleBuilt: relaxedOutcome.bundleBuilt };
}

function toGiftItem(entry: ScoredItem): GiftItem {
  const affinityPct = Math.round(entry.affinity * 100);
  const explained = {
    title: entry.item.title,
    brand: entry.item.brand,
    price: entry.item.price,
    category: entry.item.category,
    entityName: entry.entity.name,
    affinityPct,
    source: entry.source,
    matchedInterests: entry.matchedInterests,
  };
  return {
    id: entry.item.id,
    title: entry.item.title,
    brand: entry.item.brand,
    price: entry.item.price,
    currency: entry.item.currency,
    image: entityImageUrl(entry.entity),
    buyUrl: entry.item.buyUrl,
    category: entry.item.category,
    description: entry.item.description,
    inventory: entry.item.inventory,
    entityName: entry.entity.name,
    entityType: shortType(entry.entity.type),
    affinity: entry.affinity,
    affinityPct,
    source: entry.source,
    matchedInterests: entry.matchedInterests,
    contributors: entry.contributors,
    hops: entry.hops,
    reason: itemReason(explained),
  };
}

export interface RecommendOptions {
  sink?: ProgressSink;
  constraints?: Partial<SessionConstraints>;
  shopperNote?: string;
}

export async function recommend(input: RecommendRequest, options: RecommendOptions = {}): Promise<RecommendResult> {
  const sink = options.sink;
  const warnings: string[] = [];
  const constraints = normalizeConstraints(options.constraints);
  const interests = normalizeInterests(input.interests);
  stage(sink, "start", "Starting the taste reading", options.sink && options.constraints ? "refinement run" : undefined);
  if (interests.length === 0) {
    throw new QlooError(400, "Add at least one interest (an artist, movie, show, book, or brand).");
  }
  const budget = sanitizeBudget({
    min: constraints.budgetMin ?? input.budget?.min,
    max: constraints.budgetMax ?? input.budget?.max,
  });

  if (constraints.boost.size > 0 || constraints.mute.size > 0) {
    const parts: string[] = [];
    if (constraints.boost.size > 0) parts.push(`leaning into ${Array.from(constraints.boost).slice(0, 3).join(", ")}`);
    if (constraints.mute.size > 0) parts.push(`dialing down ${Array.from(constraints.mute).slice(0, 3).join(", ")}`);
    sink?.({ type: "agent-note", message: `signal mix adjusted — ${parts.join(" · ")}` });
  }
  if (constraints.avoidItemIds.size > 0 || constraints.priorItemIds.size > 0) {
    sink?.({
      type: "agent-note",
      message: `${constraints.avoidItemIds.size} avoided · ${constraints.priorItemIds.size} already shown — searching beyond them`,
    });
  }

  const resolved = await resolveInterests(interests, warnings, sink);
  if (resolved.length === 0) {
    throw new QlooError(422, "None of those interests matched anything in Qloo's taste graph. Try more specific names.");
  }

  const signalIds = resolved.map((entry) => entry.entity.entity_id);
  const signalTypeSet = new Set(resolved.map((entry) => entry.entity.type));
  const signalWeights = signalWeightsFor(resolved, constraints);
  const resolvedNameById = new Map(resolved.map((entry) => [entry.entity.entity_id, entry.input] as const));

  const expansion = await expandTaste({ signalIds, signalWeights, resolvedNameById, constraints, warnings, sink });
  const catalogEntities = await resolveCatalogEntities({ expansion, resolvedInterests: resolved, sink });
  stage(sink, "score", "Scoring every catalog product against their taste", `${catalogEntities.size} products mapped to Qloo entities`);
  const scored = await scoreCatalog({ catalogEntities, signalIds, signalWeights, resolved, expansion, constraints, warnings, sink });

  const excludedIds = new Set([...constraints.avoidItemIds, ...constraints.priorItemIds]);
  const candidateIds = Array.isArray(input.candidateItemIds)
    ? [...new Set(input.candidateItemIds.filter((id) => typeof id === "string"))].slice(0, 60)
    : [];
  const candidateSet = candidateIds.length > 0 ? new Set(candidateIds) : undefined;
  let pool = scored.filter(
    (entry) => entry.item.price <= budget.max && entry.item.price >= budget.min && !excludedIds.has(entry.item.id),
  );
  if (candidateSet) {
    const skipped = scored.filter(
      (entry) => candidateSet.has(entry.item.id) && (entry.item.price < budget.min || entry.item.price > budget.max),
    );
    pool = pool.filter((entry) => candidateSet.has(entry.item.id));
    if (skipped.length > 0) {
      const titles = skipped
        .map((entry) => entry.item.title)
        .slice(0, 3)
        .join("; ");
      pushWarning(
        warnings,
        sink,
        `Skipped ${skipped.length} pinned pick${skipped.length === 1 ? "" : "s"} outside the $${budget.min}–$${budget.max} budget: ${titles}${skipped.length > 3 ? "…" : ""}.`,
      );
    }
    stage(sink, "select", `Shortlist mode — scoring only the ${candidateSet.size} pinned pick${candidateSet.size === 1 ? "" : "s"}`);
  }
  if (pool.length === 0) {
    throw new QlooError(
      422,
      candidateSet
        ? `None of the pinned picks fit a $${budget.min}–$${budget.max} budget${excludedIds.size > 0 ? " after removing the picks you passed on" : ""}. Widen the range, unpin, or bring picks back into rotation.`
        : `No catalog gifts fit a $${budget.min}–$${budget.max} budget${excludedIds.size > 0 ? " after removing the picks you passed on" : ""}. Widen the range or bring picks back into rotation.`,
    );
  }

  stage(sink, "select", "Selecting the three lanes", `${pool.length} eligible items · budget $${budget.min}–$${budget.max}`);
  const { lanes, bundleBuilt } = buildLanes(pool, budget.max, signalTypeSet, warnings, sink);
  markPicked(lanes.flatMap((entry) => entry.items.map((item) => item.item.id)));
  const wildcardLane = lanes.find((entry) => entry.lane === "surprise");
  if (wildcardLane) markWildcard(wildcardLane.items);
  if (lanes.length === 0) {
    throw new QlooError(422, "Nothing scored high enough to recommend. Try different interests.");
  }
  if (!bundleBuilt) {
    pushWarning(warnings, sink, "Budget too tight for a multi-item bundle — showing single picks instead.");
  }
  for (const { lane, items } of lanes) {
    sink?.({ type: "selection", lane, headline: defaultHeadline(lane), titles: items.map((entry) => entry.item.title) });
  }

  stage(sink, "explain", "Writing the receipt copy", "grounded in the resolved taste signals");
  const shopperNote = [input.notes, options.shopperNote]
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    .join(" · ");
  const explanations = await buildLaneExplanations({
    recipientName: input.recipientName,
    occasion: input.occasion,
    interests: resolved.map((entry) => entry.input),
    budgetMax: budget.max,
    notes: shopperNote.length > 0 ? shopperNote : undefined,
    lanes: lanes.map((entry) => ({
      lane: entry.lane,
      items: entry.items.map((scoredItem) => ({
        title: scoredItem.item.title,
        brand: scoredItem.item.brand,
        price: scoredItem.item.price,
        category: scoredItem.item.category,
        entityName: scoredItem.entity.name,
        affinityPct: Math.round(scoredItem.affinity * 100),
        source: scoredItem.source,
        matchedInterests: scoredItem.matchedInterests,
      })),
    })),
  });

  const picks: GiftPick[] = lanes.map(({ lane, items }) => ({
    lane,
    headline: explanations[lane]?.headline ?? defaultHeadline(lane),
    explanation: explanations[lane]?.explanation ?? "",
    items: items.map(toGiftItem),
    totalPrice: items.reduce((sum, entry) => sum + entry.item.price, 0),
  }));

  const laneItemIds = new Set(lanes.flatMap(({ items }) => items.map((entry) => entry.item.id)));
  const shelf = sortByAffinity(pool)
    .filter((entry) => !laneItemIds.has(entry.item.id))
    .slice(0, 8)
    .map(toGiftItem);

  const tasteMap: TasteMapEntry[] = [];
  const perTypeCount = new Map<string, number>();
  const byAffinity = Array.from(expansion.values()).sort((a, b) => b.affinity - a.affinity);
  for (const entry of byAffinity) {
    if (tasteMap.length >= 14) break;
    const type = shortType(entry.entity.type);
    const count = perTypeCount.get(type) ?? 0;
    if (count >= 3) continue;
    perTypeCount.set(type, count + 1);
    tasteMap.push({
      type,
      entityName: entry.entity.name,
      affinityPct: Math.round(entry.affinity * 100),
      hops: entry.hops,
      via: entry.hops === 2 && entry.via ? entry.via.hopName : undefined,
    });
  }
  const connections: TasteConnection[] = byAffinity
    .filter((entry) => entry.hops === 2 && entry.via?.from)
    .slice(0, 6)
    .map((entry) => ({
      from: entry.via!.from,
      to: entry.entity.name,
      via: entry.via!.hopName,
      affinityPct: Math.round(entry.affinity * 100),
      hops: 2,
    }));

  return {
    resolvedInterests: resolved.map((entry) => ({
      input: entry.input,
      matchedName: entry.entity.name,
      type: shortType(entry.entity.type),
      alternates: entry.alternates.map((alternate) => ({
        type: shortType(alternate.type),
        name: alternate.name,
        popularity: Math.round(alternate.popularity * 100) / 100,
        urn: alternate.type,
      })),
      candidates: entry.candidates.map((candidate) => ({
        type: shortType(candidate.type),
        name: candidate.name,
        popularity: Math.round(candidate.popularity * 100) / 100,
        urn: candidate.type,
      })),
    })),
    tasteMap,
    connections,
    picks,
    shelf,
    warnings,
  };
}

function signalWeightsFor(resolved: ResolvedInterest[], constraints: NormalizedConstraints): number[] | undefined {
  if (constraints.boost.size === 0 && constraints.mute.size === 0) return undefined;
  const weights = resolved.map((entry) => {
    const key = entry.input.toLowerCase();
    if (constraints.boost.has(key)) return 1.8;
    if (constraints.mute.has(key)) return 0.3;
    return 1;
  });
  return weights.some((weight) => weight !== 1) ? weights : undefined;
}
