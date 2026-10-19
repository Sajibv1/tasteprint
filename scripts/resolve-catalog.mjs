// Resolves every catalog item to a Qloo entity once, storing the mapping in
// src/data/catalog-entities.json so the server doesn't pay ~170 /search
// calls on every cold start. Re-run after editing catalog.json.
//
// Merges into the existing mapping instead of replacing it: curated gift rows
// in src/data/curated-gifts.ts reference legacy tp-* entries that were resolved
// from earlier catalog revisions and are not re-listed in catalog.json.
//
// Usage: QLOO_API_KEY=... node scripts/resolve-catalog.mjs
// (.env.local is read automatically when run from the repo root.)
import { readFileSync, writeFileSync } from "node:fs";

try {
  const text = readFileSync(".env.local", "utf8");
  for (const line of text.split("\n")) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {
  // no .env.local — rely on the environment
}

const BASE = (process.env.QLOO_BASE_URL || "https://hackathon.api.qloo.com").trim();
const KEY = (process.env.QLOO_API_KEY || "").trim();
if (!KEY) {
  console.error("QLOO_API_KEY is required (env or .env.local).");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function popularityOf(raw) {
  if (typeof raw?.popularity === "number") return raw.popularity;
  if (typeof raw?.properties?.popularity === "number") return raw.properties.popularity;
  return 0;
}

async function search(query, types) {
  const url = new URL("/search", BASE);
  url.searchParams.set("query", query);
  if (types && types.length > 0) url.searchParams.set("types", types.join(","));
  url.searchParams.set("take", "6");
  url.searchParams.set("sort_by", "match");
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const res = await fetch(url, {
      headers: { "X-Api-Key": KEY, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get("retry-after")) || 0;
      await sleep(Math.min(15_000, retryAfter > 0 ? retryAfter * 1000 : 800 * 2 ** (attempt - 1)));
      continue;
    }
    if (!res.ok) throw new Error(`search ${res.status} for "${query}"`);
    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
  }
  throw new Error(`search exhausted for "${query}"`);
}

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .trim();
}

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function imageUrlOf(entity) {
  const raw = entity?.properties?.image;
  const url = typeof raw === "string" ? raw : raw !== null && typeof raw === "object" ? raw.url : undefined;
  if (typeof url !== "string") return undefined;
  const clean = url.trim();
  return clean.startsWith("https://") ? clean : undefined;
}

function pick(results, query) {
  const norm = normalize(query);
  const exacts = results.filter((entity) => normalize(entity.name) === norm);
  if (exacts.length > 0) {
    exacts.sort((a, b) => popularityOf(b) - popularityOf(a));
    return { entity: exacts[0], match: exacts.length > 1 ? "exact-ambiguous" : "exact" };
  }
  const starts = results.find((entity) => normalize(entity.name).startsWith(norm));
  if (starts) return { entity: starts, match: "prefix" };
  const ranked = [...results].sort((a, b) => popularityOf(b) - popularityOf(a));
  if (ranked[0]) return { entity: ranked[0], match: "popular" };
  return { entity: null, match: "none" };
}

function typeOf(entity) {
  if (typeof entity.type === "string" && entity.type.startsWith("urn:entity:")) return entity.type;
  if (typeof entity.subtype === "string" && entity.subtype.startsWith("urn:entity:")) return entity.subtype;
  const types = Array.isArray(entity.types) ? entity.types.filter((t) => typeof t === "string") : [];
  return types.find((t) => t.startsWith("urn:entity:")) ?? types[0] ?? "";
}

const catalog = JSON.parse(readFileSync("src/data/catalog.json", "utf8"));
let mapping = {};
try {
  mapping = JSON.parse(readFileSync("src/data/catalog-entities.json", "utf8"));
  if (typeof mapping !== "object" || mapping === null || Array.isArray(mapping)) mapping = {};
} catch {
  // no existing mapping file — start fresh
}
const report = [];

for (const item of catalog) {
  let entity = null;
  let match = "none";
  try {
    const typed = await search(item.qloo.query, [item.qloo.type]);
    if (typed.length > 0) {
      ({ entity, match } = pick(typed, item.qloo.query));
    } else {
      const untyped = await search(item.qloo.query, []);
      ({ entity, match } = pick(untyped, item.qloo.query));
    }
  } catch (error) {
    report.push(`${item.id} ERROR ${error.message}`);
    continue;
  }
  if (!entity?.entity_id) {
    report.push(`${item.id} NO-RESULT query=${item.qloo.query}`);
    continue;
  }
  const image = imageUrlOf(entity);
  mapping[item.id] = {
    entity_id: entity.entity_id,
    name: decodeEntities(entity.name).trim(),
    type: typeOf(entity),
    ...(image ? { image } : {}),
  };
  if (match !== "exact" || normalize(entity.name) !== normalize(item.qloo.query)) {
    report.push(`${item.id} ${match.toUpperCase()} query=${item.qloo.query} -> ${entity.name} (${typeOf(entity)})`);
  }
  await sleep(250);
}

writeFileSync("src/data/catalog-entities.json", JSON.stringify(mapping, null, 2) + "\n");
console.log(`mapped ${Object.keys(mapping).length}/${catalog.length} items`);
for (const line of report) console.log(" ", line);
