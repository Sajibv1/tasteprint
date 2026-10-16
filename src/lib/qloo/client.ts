import type {
  QlooEntity,
  QlooEntityProperties,
  QlooInsightsResponse,
  QlooSearchResponse,
  QlooTag,
  QlooTagSearchResponse,
} from "./types";

const DEFAULT_BASE_URL = "https://hackathon.api.qloo.com";
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CONCURRENT = 2;
const MAX_ATTEMPTS = 6;
const MAX_BACKOFF_MS = 8000;

export class QlooError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "QlooError";
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let activeRequests = 0;
const waitQueue: (() => void)[] = [];

async function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests += 1;
    return;
  }
  await new Promise<void>((resolve) => waitQueue.push(resolve));
}

function releaseSlot(): void {
  activeRequests -= 1;
  const next = waitQueue.shift();
  if (next) {
    activeRequests += 1;
    next();
  }
}

type QueryValue = string | number | boolean | string[] | undefined | null;

type CacheEntry = { expires: number; value: unknown };

const memoryCache = new Map<string, CacheEntry>();

async function cached<T>(key: string, fn: () => Promise<T>, ttlMs = CACHE_TTL_MS): Promise<T> {
  const hit = memoryCache.get(key);
  if (hit && hit.expires > Date.now()) {
    return hit.value as T;
  }
  const pending = fn();
  memoryCache.set(key, { expires: Date.now() + ttlMs, value: pending });
  try {
    const value = await pending;
    memoryCache.set(key, { expires: Date.now() + ttlMs, value });
    return value;
  } catch (error) {
    memoryCache.delete(key);
    throw error;
  }
}

function baseUrl(): string {
  const configured = process.env.QLOO_BASE_URL?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_BASE_URL;
}

function apiKey(): string {
  const key = process.env.QLOO_API_KEY?.trim();
  if (!key) {
    throw new QlooError(500, "QLOO_API_KEY is not configured. Add it to .env.local.");
  }
  return key;
}

function buildUrl(path: string, params: Record<string, QueryValue>): URL {
  const url = new URL(path, baseUrl());
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return url;
}

async function qlooGet<T>(path: string, params: Record<string, QueryValue>): Promise<T> {
  const url = buildUrl(path, params);
  for (let attempt = 1; ; attempt += 1) {
    await acquireSlot();
    try {
      const res = await fetch(url, {
        headers: { "X-Api-Key": apiKey(), Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= MAX_ATTEMPTS) {
          const body = await res.text().catch(() => "");
          throw new QlooError(res.status, `Qloo ${res.status} after ${attempt} attempts: ${body.slice(0, 200)}`);
        }
        const retryAfter = Number(res.headers.get("retry-after")) || 0;
        const delay = Math.min(
          MAX_BACKOFF_MS,
          retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** (attempt - 1) + Math.random() * 400,
        );
        await sleep(delay);
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new QlooError(res.status, `Qloo ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
      }
      return (await res.json()) as T;
    } catch (error) {
      if (error instanceof QlooError || attempt >= MAX_ATTEMPTS) throw error;
      await sleep(300 * attempt);
    } finally {
      releaseSlot();
    }
  }
}

function toEntity(raw: Record<string, unknown>): QlooEntity {
  const id = raw.entity_id ?? raw.id ?? raw.uuid;
  const types = Array.isArray(raw.types) ? raw.types.filter((entry): entry is string => typeof entry === "string") : [];
  const typeField = typeof raw.type === "string" ? raw.type : "";
  const subtype = typeof raw.subtype === "string" && raw.subtype.startsWith("urn:entity:") ? raw.subtype : "";
  const specificType = typeField.startsWith("urn:entity:") ? typeField : "";
  const type = specificType || subtype || types[0] || typeField;
  const query = raw.query && typeof raw.query === "object" ? (raw.query as Record<string, unknown>) : undefined;
  const affinity =
    typeof raw.affinity === "number"
      ? raw.affinity
      : query && typeof query.affinity === "number"
        ? query.affinity
        : undefined;
  return {
    ...raw,
    entity_id: typeof id === "string" ? id : "",
    name: typeof raw.name === "string" ? raw.name : "",
    type,
    affinity,
    properties: (raw.properties as QlooEntityProperties | undefined) ?? undefined,
  } as QlooEntity;
}

export function normalizeEntities(list: unknown): QlooEntity[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map(toEntity)
    .filter((entity) => entity.entity_id.length > 0 && entity.name.length > 0);
}

export function entityImageUrl(entity: QlooEntity): string | null {
  const raw = entity.properties?.image;
  const url =
    typeof raw === "string" ? raw : raw !== null && typeof raw === "object" ? (raw as { url?: unknown }).url : undefined;
  if (typeof url !== "string") return null;
  const clean = url.trim();
  return clean.startsWith("https://") ? clean : null;
}

export interface SearchOptions {
  types?: string[];
  take?: number;
}

export async function searchEntities(query: string, options: SearchOptions = {}): Promise<QlooEntity[]> {
  const params: Record<string, QueryValue> = {
    query,
    types: options.types,
    take: options.take ?? 5,
    sort_by: "match",
  };
  return cached(`search:${JSON.stringify(params)}`, async () => {
    const data = await qlooGet<QlooSearchResponse>("/search", params);
    return normalizeEntities(data.results);
  });
}

export interface InsightsOptions {
  filterType: string;
  signalEntities?: string[];
  signalWeights?: number[];
  signalTags?: string[];
  signalWeight?: string;
  audiences?: string[];
  resultEntities?: string[];
  excludeEntities?: string[];
  take?: number;
  page?: number;
  sortBy?: "affinity" | "distance" | "rating" | "quality";
  explainability?: boolean;
  requireImage?: boolean;
  biasTrends?: "off" | "very_low" | "low" | "mid" | "medium" | "high" | "very_high";
  biasContentBased?: number;
}

export async function getInsights(options: InsightsOptions): Promise<QlooInsightsResponse> {
  const take = Math.min(options.take ?? 25, 50);
  const params: Record<string, QueryValue> = {
    "filter.type": options.filterType,
    take,
    page: options.page,
    sort_by: options.sortBy,
    "feature.explainability": options.explainability ? true : undefined,
    "filter.exists": options.requireImage ? "properties.image" : undefined,
    "bias.trends": options.biasTrends,
    "bias.content_based": options.biasContentBased,
    "signal.interests.entities": options.signalEntities,
    "signal.interests.tags": options.signalTags,
    "signal.interests.entities.weight":
      options.signalWeight ?? (options.signalWeights && options.signalEntities ? options.signalWeights.join(",") : undefined),
    "signal.demographics.audiences": options.audiences,
    "filter.results.entities": options.resultEntities,
    "filter.exclude.entities": options.excludeEntities,
  };
  return cached(`insights:${JSON.stringify(params)}`, async () => {
    const data = await qlooGet<QlooInsightsResponse>("/v2/insights", params);
    return {
      ...data,
      results: {
        ...data.results,
        entities: normalizeEntities(data.results?.entities),
      },
    };
  });
}

export async function searchTags(query: string, take = 10): Promise<QlooTag[]> {
  const params: Record<string, QueryValue> = { query, take };
  return cached(`tags:${JSON.stringify(params)}`, async () => {
    const data = await qlooGet<QlooTagSearchResponse>("/v2/tags", params);
    return Array.isArray(data.results) ? data.results : [];
  });
}
