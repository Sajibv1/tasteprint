import { catalog, catalogImage, mappedCatalogEntity, type CatalogItem } from "@/lib/catalog";
import { buildLaneExplanations, defaultHeadline, itemReason } from "./explain";
import { buildFallbackDossier } from "./pipeline";
import { diverseDiscoveries } from "./discovery";
import {
  DISCOVERY_TYPES,
  clamp01,
  laneLabel,
  popularityOf,
  shortType,
  toolExpandTaste,
  toolResolveEntity,
  toolScoreCatalog,
  type ExpandedEntity,
  type ResolvedEntity,
  type ScoredCandidate,
  type ToolContext,
} from "./tools";
import type {
  AgentEvent,
  ClarificationOption,
  GiftItem,
  GiftPick,
  LaneKey,
  ProgressSink,
  RecommendRequest,
  RecommendResult,
  SessionConstraints,
  TasteConnection,
  TasteDossier,
  TasteMapEntry,
} from "./types";

/**
 * The agentic path.
 *
 * Instead of running resolve → expand → hop2 → score → select in a fixed
 * order, an LLM chooses the next move: which interest to resolve, whether the
 * first expansion is thin enough to justify a second hop, which candidates
 * belong in each lane, and when the result is good enough to show.
 *
 * The deterministic pipeline in `pipeline.ts` remains the fallback: if no LLM
 * key is configured, the model errors, or the loop runs out of steps before
 * finalizing, `recommend()` takes over and the user still gets picks.
 *
 * Design constraints:
 * - The model never invents prices, titles, or entities: it selects among tool
 *   results. All numeric evidence comes from Qloo.
 * - The loop is bounded (MAX_STEPS) so a confused model cannot burn the budget.
 * - Every tool call is streamed as an event, so the UI can show the reasoning.
 */

type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const MAX_STEPS = 14;
const MAX_CANDIDATES = 60;

const TOOLS: ToolSchema[] = [
  {
    type: "function",
    function: {
      name: "resolve_entity",
      description:
        "Resolve one free-text interest (artist, film, book, show, brand) to a single Qloo entity. Call once per interest. Returns alternates if the name is ambiguous — if alternates exist and the types differ meaningfully, call again with the `type` you judge most likely (e.g. a user saying 'Dune' for a gift is usually the film).",
      parameters: {
        type: "object",
        properties: {
          interest: { type: "string", description: "The interest text as the shopper typed it." },
          type: {
            type: "string",
            description:
              "Optional Qloo entity type, e.g. urn:entity:artist, urn:entity:movie, urn:entity:book, urn:entity:tv_show, urn:entity:brand.",
          },
          reason: { type: "string", description: "One short sentence on why this resolution was chosen." },
        },
        required: ["interest"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "expand_taste",
      description:
        "Ask Qloo for cultural neighbors across artists, brands, books and film. Call once with the resolved seed entities for hop 1. Then, if at least two domains returned results with affinity >= 0.25, call again passing 2-4 of the most interesting hop-1 entities as bridgeIds to reach a second hop. Skip the second hop when the first is already rich or the user asked for grounded, mainstream picks.",
      parameters: {
        type: "object",
        properties: {
          bridgeIds: {
            type: "array",
            items: { type: "string" },
            description: "Entity IDs from hop 1 to bridge through. Omit or pass [] for the first hop.",
          },
          perType: { type: "number", description: "How many results per domain, 5-25. Default 12." },
          reason: { type: "string", description: "Why this hop (or why not a second one)." },
        },
        required: ["reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "score_candidates",
      description:
        "Score catalog products against the taste signal. Returns each product's affinity to the recipient's taste. Call after expansion, or again after the shopper changes constraints.",
      parameters: {
        type: "object",
        properties: {
          itemIds: {
            type: "array",
            items: { type: "string" },
            description: "Optional: score only these catalog item IDs. Omit to score everything that maps to a resolved or discovered entity.",
          },
          reason: { type: "string" },
        },
        required: ["reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_budget",
      description:
        "Check the total cost of candidate items or a proposed bundle against the budget ceiling. Returns individual item prices, sum, and whether it fits within budget. Call this before select_lanes to verify bundle feasibility.",
      parameters: {
        type: "object",
        properties: {
          itemIds: {
            type: "array",
            items: { type: "string" },
            description: "Catalog item IDs to check against the budget.",
          },
          reason: { type: "string", description: "Why checking this combination." },
        },
        required: ["itemIds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "select_lanes",
      description:
        "Commit the final three picks. You choose item IDs from the scored candidates. Rules: 'safe' is one item with the strongest affinity that is in stock; 'surprise' is one item the recipient would not find on their own — prefer a different category and a cross-domain or two-hop origin; 'bundle' is 2-3 items that tell one taste story, from different categories, totalling within budget. Never repeat an item across lanes.",
      parameters: {
        type: "object",
        properties: {
          safe: { type: "string", description: "Catalog item ID for the safe pick." },
          surprise: { type: "string", description: "Catalog item ID for the wild card." },
          bundle: { type: "array", items: { type: "string" }, description: "2-3 catalog item IDs for the bundle." },
          rationale: { type: "string", description: "One or two sentences tying the choices to the taste evidence." },
        },
        required: ["safe", "surprise", "bundle", "rationale"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "synthesize_dossier",
      description:
        "Synthesize the recipient's Cultural Taste Dossier: an intelligent, 1-2 paragraph cultural analysis connecting their stated seeds and discoveries (e.g. why Björk, Ghibli, and Sally Rooney share an aesthetic of atmospheric intimacy), plus 3-5 defining aesthetic keywords.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "A punchy title for their cultural profile (e.g. 'Atmospheric Intimacy & Lyrical Nostalgia')" },
          narrative: { type: "string", description: "1-2 paragraphs detailing the common aesthetic, cultural, or philosophical thread that unites their taste." },
          keywords: { type: "array", items: { type: "string" }, description: "3-5 aesthetic keywords (e.g. ['Art-Pop', 'Magical Realism', 'Emotional Melancholy'])" },
        },
        required: ["title", "narrative", "keywords"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_clarification",
      description:
        "Proactively ask the shopper a clarifying question when a seed interest is genuinely ambiguous (e.g. 'Dune' film vs book) or when constraints conflict with realistic product options. Renders interactive choice chips for the user.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "The conversational question to ask the shopper." },
          key: { type: "string", description: "A unique identifier for this question (e.g. 'clarify-dune', 'budget-conflict')." },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "User-facing chip text (e.g. 'Denis Villeneuve Film (2021)')" },
                value: { type: "string", description: "Value used for resolution or constraint modification" },
                detail: { type: "string", description: "Short subtitle on what this implies" },
              },
              required: ["label", "value"],
            },
            description: "2-4 actionable options for the shopper to click.",
          },
        },
        required: ["question", "key", "options"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finish",
      description:
        "End the run. Call only after select_lanes succeeded, or when you cannot produce a valid selection and want the deterministic fallback to take over.",
      parameters: {
        type: "object",
        properties: {
          fallback: {
            type: "boolean",
            description: "True to hand this run to the deterministic pipeline instead of using selected lanes.",
          },
          message: { type: "string", description: "Optional short note shown in the transcript." },
        },
      },
    },
  },
];

const SYSTEM_PROMPT = [
  "You are Tasteprint, an autonomous cultural gift concierge powered by Qloo's taste intelligence graph.",
  "You are not a keyword matcher or a dumb script. You are an expert cultural curator with strong opinions, aesthetic intuition, and deep domain knowledge across music, cinema, literature, art, and design.",
  "",
  "Internal Monologue (Thoughts):",
  "Before issuing tool calls, write a 1-2 sentence thought in your assistant message reflecting on what you are weighing or testing (e.g. 'Priya combines Scandinavian art-pop with Ghibli's pastoral fantasy. I want to test if Wong Kar-wai or Japanese ambient literature bridges these two...'). This thought is streamed directly to the user as your live reasoning.",
  "",
  "Autonomous Workflow:",
  "1. resolve_entity: Resolve each input to a verified Qloo entity. If genuinely ambiguous (e.g. Dune movie vs book), you can call ask_clarification to offer choice chips to the shopper.",
  "2. expand_taste: Discover cultural neighbors across artists, brands, books, and film. If first-hop affinity is high across 2+ domains, bridge through 2-4 surprising entities for a second hop.",
  "3. synthesize_dossier: Synthesize a cohesive Cultural Taste Dossier explaining the common aesthetic and emotional thread connecting their interests.",
  "4. score_candidates: Score catalog gifts against the taste signal.",
  "5. check_budget: Verify bundle cost against budget ceiling. If a bundle blows the budget, re-plan with a cheaper set or 2-item bundle.",
  "6. select_lanes: Choose Safe Bet (top affinity), Wild Card (surprising cross-domain discovery, different category), and The Bundle (cohesive narrative set within budget).",
  "7. finish.",
  "",
  "Hard Rules:",
  "- Never invent products or IDs; only select from scored candidates.",
  "- Budget ceiling is absolute for items and bundle total.",
  "- Be thoughtful, insightful, and culturally articulate.",
].join("\n");

function buildUserPrompt(request: RecommendRequest, constraints: NormalizedConstraints, note?: string): string {
  const interests = request.interests
    .map((entry) => (typeof entry === "string" ? entry : `${entry.name}${entry.type ? ` (${shortType(entry.type)})` : ""}`))
    .join(", ");
  const pieces = [
    `Recipient: ${request.recipientName?.trim() || "unnamed"}`,
    `Occasion: ${request.occasion?.trim() || "unspecified"}`,
    `Interests: ${interests}`,
    `Budget: $${constraints.budgetMin}–$${constraints.budgetMax}`,
  ];
  if (request.categories && request.categories.length > 0) {
    pieces.push(`Only consider these product categories: ${request.categories.join(", ")}`);
  }
  if (constraints.avoidIds.size > 0) pieces.push(`Do NOT pick these item IDs (already rejected): ${[...constraints.avoidIds].join(", ")}`);
  if (constraints.priorIds.size > 0) pieces.push(`Prefer not to repeat these item IDs (already shown): ${[...constraints.priorIds].join(", ")}`);
  if (constraints.boost.size > 0) pieces.push(`Lean harder into: ${[...constraints.boost].join(", ")}`);
  if (constraints.mute.size > 0) pieces.push(`Dial down: ${[...constraints.mute].join(", ")}`);
  if (constraints.mood) pieces.push(`Direction: ${constraints.mood}`);
  if (note) pieces.push(`Shopper's own words: "${note}"`);
  return pieces.join("\n");
}

interface NormalizedConstraints {
  budgetMin: number;
  budgetMax: number;
  avoidIds: Set<string>;
  priorIds: Set<string>;
  boost: Set<string>;
  mute: Set<string>;
  mood?: "adventurous" | "grounded";
}

function normalizeConstraints(request: RecommendRequest, raw?: Partial<SessionConstraints>): NormalizedConstraints {
  let min = Number.isFinite(raw?.budgetMin) ? Math.max(0, Math.round(raw?.budgetMin ?? 0)) : Number.isFinite(request.budget?.min) ? Math.max(0, Math.round(request.budget?.min ?? 0)) : 0;
  let max = Number.isFinite(raw?.budgetMax) ? Math.max(5, Math.round(raw?.budgetMax ?? 100)) : Number.isFinite(request.budget?.max) ? Math.max(5, Math.round(request.budget?.max ?? 100)) : 100;
  if (min > max) [min, max] = [max, min];
  const mood = raw?.mood === "adventurous" || raw?.mood === "grounded" ? raw.mood : undefined;
  return {
    budgetMin: min,
    budgetMax: max,
    avoidIds: new Set(raw?.avoidItemIds ?? []),
    priorIds: new Set(raw?.priorItemIds ?? []),
    boost: new Set((raw?.boostInterests ?? []).map((entry) => entry.toLowerCase())),
    mute: new Set((raw?.muteInterests ?? []).map((entry) => entry.toLowerCase())),
    mood,
  };
}

const catalogById = new Map<string, CatalogItem>(catalog.map((item) => [item.id, item]));

interface CandidateInternal extends ScoredCandidate {
  catalog: CatalogItem;
}

interface ToolRunState {
  resolved: Map<string, ResolvedEntity>;
  expansions: Map<string, ExpandedEntity>;
  hop1: ExpandedEntity[];
  candidates: Map<string, CandidateInternal>;
  lastScoreIds: Set<string>;
  selected?: { safe: string; surprise: string; bundle: string[]; rationale: string };
  dossier?: TasteDossier;
  clarifications?: ClarificationOption[];
  fallbackRequested: boolean;
}

function catalogEntity(item: CatalogItem, state: ToolRunState): { id: string; entityId: string; entityType: string; name: string; hops?: number; via?: string } | undefined {
  const mapped = mappedCatalogEntity(item);
  if (mapped?.entity_id) {
    const expansion = state.expansions.get(mapped.entity_id);
    return {
      id: item.id,
      entityId: mapped.entity_id,
      entityType: mapped.type,
      name: mapped.name,
      hops: expansion?.hops,
      via: expansion?.via,
    };
  }
  const byName = [...state.resolved.values()].find((entry) => entry.name.toLowerCase() === item.qloo.query.toLowerCase());
  if (byName) return { id: item.id, entityId: byName.id, entityType: byName.type, name: byName.name };
  return undefined;
}

async function callChat(params: {
  messages: ChatMessage[];
  tools: ToolSchema[];
  temperature: number;
  timeoutMs: number;
}): Promise<{ message: ChatMessage & { role: "assistant" }; finishReason?: string }> {
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (!apiKey) throw new Error("LLM_API_KEY is not configured");
  const baseUrl = (process.env.LLM_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.LLM_MODEL?.trim() || "gpt-4o-mini";
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: params.temperature,
      tools: params.tools,
      tool_choice: "auto",
      messages: params.messages,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(params.timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: ChatMessage & { role: "assistant" }; finish_reason?: string }[];
  };
  const choice = data.choices?.[0];
  if (!choice?.message) throw new Error("LLM returned no message");
  return { message: choice.message, finishReason: choice.finish_reason };
}

function parseArgs(raw: string): Record<string, unknown> {
  if (!raw || raw.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function emit(sink: ProgressSink | undefined, event: AgentEvent): void {
  sink?.(event);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0) : [];
}

function signalPlan(resolved: Iterable<ResolvedEntity>, constraints: NormalizedConstraints): {
  ids: string[];
  weights: number[];
  names: Record<string, string>;
} {
  const entries = [...resolved];
  return {
    ids: entries.map((entry) => entry.id),
    weights: entries.map((entry) => {
      const key = entry.input.toLowerCase();
      if (constraints.mute.has(key)) return 0.3;
      return constraints.boost.has(key) ? 1.8 : 1;
    }),
    names: Object.fromEntries(entries.map((entry) => [entry.id, entry.input])),
  };
}

/**
 * Run the agent loop. Returns a RecommendResult when the model finalized a
 * selection; returns null when the caller should fall back to the
 * deterministic pipeline.
 */
export async function runAgent(
  request: RecommendRequest,
  options: { sink?: ProgressSink; constraints?: Partial<SessionConstraints>; shopperNote?: string } = {},
): Promise<RecommendResult | null> {
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (!apiKey) return null;

  const sink = options.sink;
  const constraints = normalizeConstraints(request, options.constraints);
  const toolContext: ToolContext = { sink, warnings: [] };
  const state: ToolRunState = {
    resolved: new Map(),
    expansions: new Map(),
    hop1: [],
    candidates: new Map(),
    lastScoreIds: new Set(),
    fallbackRequested: false,
  };

  emit(sink, { type: "stage", stage: "start", label: "Planning the gift hunt", detail: "agent mode" });

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(request, constraints, options.shopperNote) },
  ];

  try {
    for (let step = 0; step < MAX_STEPS; step += 1) {
      const { message } = await callChat({ messages, tools: TOOLS, temperature: 0.2, timeoutMs: 45_000 });
      const calls = message.tool_calls ?? [];

      if (calls.length === 0) {
        // The model answered in prose instead of calling a tool.
        if (message.content && message.content.trim().length > 0) {
          emit(sink, { type: "thought", content: message.content.trim() });
        }
        messages.push({ role: "assistant", content: message.content ?? "" });
        messages.push({
          role: "user",
          content: "Continue the run using the tools. Call the next tool now.",
        });
        continue;
      }

      if (message.content && message.content.trim().length > 0) {
        emit(sink, { type: "thought", content: message.content.trim() });
      }

      messages.push({ role: "assistant", content: message.content ?? null, tool_calls: calls });

      for (const call of calls) {
        const name = call.function.name;
        const args = parseArgs(call.function.arguments);
        const reason = asString(args.reason) ?? asString(args.rationale);
        emit(sink, {
          type: "agent-step",
          tool: name,
          summary: summarizeToolCall(name, args),
          reason,
        });

        let toolResult: unknown;
        switch (name) {
          case "resolve_entity": {
            const interest = asString(args.interest);
            if (!interest) {
              toolResult = { error: "interest is required" };
              break;
            }
            const type = asString(args.type);
            const resolved = await toolResolveEntity({ interest, type }, toolContext);
            if ("error" in resolved) {
              toolResult = resolved;
            } else {
              state.resolved.set(resolved.input.toLowerCase(), resolved);
              toolResult = {
                input: resolved.input,
                matchedName: resolved.name,
                type: shortType(resolved.type),
                exact: resolved.exact,
                alternates: resolved.alternates.map((entry) => ({ name: entry.name, type: shortType(entry.type) })),
                candidates: resolved.candidates.map((entry) => ({ name: entry.name, type: shortType(entry.type) })),
              };
            }
            break;
          }

          case "expand_taste": {
            if (state.resolved.size === 0) {
              toolResult = { error: "resolve at least one interest before expanding" };
              break;
            }
            const seeds = [...state.resolved.values()];
            const signals = signalPlan(seeds, constraints);
            const bridgeIds = asStringArray(args.bridgeIds).filter((id) => state.expansions.has(id));
            if (asStringArray(args.bridgeIds).length > 0 && bridgeIds.length === 0) {
              toolResult = { error: "none of those bridgeIds came from a previous expansion" };
              break;
            }
            const seedNames = signals.names;
            const bridgeNames = Object.fromEntries(bridgeIds.map((id) => [id, state.expansions.get(id)?.name ?? id]));
            const { entities } = await toolExpandTaste(
              {
                signalIds: signals.ids,
                signalWeights: signals.weights,
                bridgeIds: bridgeIds.length > 0 ? bridgeIds : undefined,
                seedNames,
                bridgeNames,
                perType: typeof args.perType === "number" ? args.perType : 12,
                mood: constraints.mood,
              },
              toolContext,
            );
            for (const entry of entities) {
              if (!state.expansions.has(entry.id)) state.expansions.set(entry.id, entry);
            }
            if (bridgeIds.length === 0) {
              state.hop1 = entities.filter((entry) => entry.affinity >= 0.25).slice(0, 8);
            }
            const hops = bridgeIds.length > 0 ? 2 : 1;
            toolResult = {
              hop: hops,
              returned: entities.length,
              domains: DISCOVERY_TYPES.map((type) => {
                const short = shortType(type);
                const inDomain = entities.filter((entry) => entry.type === short);
                return { domain: short, count: inDomain.length, top: inDomain.slice(0, 3).map((entry) => ({ id: entry.id, name: entry.name, affinityPct: Math.round(entry.affinity * 100) })) };
              }),
            };
            break;
          }

          case "score_candidates": {
            if (state.resolved.size === 0) {
              toolResult = { error: "resolve interests first" };
              break;
            }
            const requested = asStringArray(args.itemIds);
            const signals = signalPlan(state.resolved.values(), constraints);
            const pool = catalog.filter((item) =>
              (requested.length === 0 || requested.includes(item.id)) &&
              !constraints.avoidIds.has(item.id) && !constraints.priorIds.has(item.id) &&
              (!request.categories?.length || request.categories.includes(item.category)) &&
              item.price >= constraints.budgetMin && item.price <= constraints.budgetMax,
            );
            const candidateRows = pool
              .map((item) => catalogEntity(item, state))
              .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
            const { scored, apiScored } = await toolScoreCatalog(
              {
                signalIds: signals.ids,
                signalWeights: signals.weights,
                signalNames: signals.names,
                candidates: candidateRows,
                mood: constraints.mood,
                take: MAX_CANDIDATES,
              },
              toolContext,
            );
            state.candidates.clear();
            state.lastScoreIds.clear();
            for (const entry of scored) {
              const item = catalogById.get(entry.itemId);
              if (!item) continue;
              if (constraints.avoidIds.has(item.id)) continue;
              if (constraints.priorIds.has(item.id)) continue;
              if (request.categories && request.categories.length > 0 && !request.categories.includes(item.category)) continue;
              if (item.price > constraints.budgetMax || item.price < constraints.budgetMin) continue;
              state.candidates.set(item.id, { ...entry, catalog: item });
              state.lastScoreIds.add(item.id);
            }
            toolResult = {
              scored: diverseDiscoveries(
                [...state.candidates.values()],
                (entry) => ({ id: entry.itemId, category: entry.category, entity: entry.entityId, affinity: entry.affinity }),
                36,
              ).map((entry) => ({
                itemId: entry.itemId,
                title: entry.title,
                category: entry.category,
                price: entry.price,
                affinityPct: Math.round(entry.affinity * 100),
                entity: entry.entityName,
                hops: entry.hops,
              })),
              apiScored,
              note:
                state.candidates.size === 0
                  ? "No candidates survived the budget/category/avoid filters. Widen budget or relax categories."
                  : `${state.candidates.size} eligible candidates.`,
            };
            break;
          }

          case "check_budget": {
            const itemIds = asStringArray(args.itemIds);
            const items = itemIds.map((id) => {
              const item = catalogById.get(id);
              return {
                id,
                title: item?.title ?? id,
                price: item?.price ?? 0,
                inStock: item?.inventory !== "preorder",
              };
            });
            const total = items.reduce((sum, item) => sum + item.price, 0);
            const withinBudget = total <= constraints.budgetMax;
            toolResult = {
              items,
              total,
              budgetMax: constraints.budgetMax,
              budgetMin: constraints.budgetMin,
              withinBudget,
              remaining: constraints.budgetMax - total,
              note: withinBudget
                ? `Bundle total $${total} fits within the $${constraints.budgetMax} budget.`
                : `Bundle total $${total} exceeds the $${constraints.budgetMax} budget by $${total - constraints.budgetMax}. Choose cheaper items or drop to a 2-item bundle.`,
            };
            break;
          }

          case "select_lanes": {
            const safe = asString(args.safe);
            const surprise = asString(args.surprise);
            const bundle = asStringArray(args.bundle);
            const rationale = asString(args.rationale) ?? "";
            if (!safe || !surprise) {
              toolResult = { error: "safe and surprise must each name one scored candidate" };
              break;
            }
            const ids = [safe, surprise, ...bundle];
            const invalid = ids.filter((id) => !state.candidates.has(id));
            if (invalid.length > 0) {
              toolResult = {
                error: `these item IDs are not in the scored candidate set: ${invalid.join(", ")}. Pick only from score_candidates output.`,
              };
              break;
            }
            const unique = new Set(ids);
            if (unique.size !== ids.length) {
              toolResult = { error: "the same item was used in more than one lane" };
              break;
            }
            if (bundle.length < 2 || bundle.length > 3) {
              toolResult = { error: "bundle must contain 2 or 3 item IDs" };
              break;
            }
            const bundleTotal = bundle.reduce((sum, id) => sum + (catalogById.get(id)?.price ?? 0), 0);
            if (bundleTotal > constraints.budgetMax) {
              toolResult = {
                error: `bundle total $${bundleTotal} exceeds budget $${constraints.budgetMax}. Swap items or drop one.`,
              };
              break;
            }
            if (state.candidates.get(safe)?.catalog.inventory === "preorder") {
              toolResult = { error: "safe must be in stock or low stock, not preorder" };
              break;
            }
            state.selected = { safe: safe!, surprise: surprise!, bundle, rationale };
            emit(sink, {
              type: "agent-note",
              message: rationale || "committed the three lanes",
            });
            toolResult = { ok: true };
            break;
          }

          case "synthesize_dossier": {
            const title = asString(args.title) || "Cultural Taste Profile";
            const narrative = asString(args.narrative) || "";
            const keywords = asStringArray(args.keywords);
            state.dossier = { title, narrative, keywords };
            emit(sink, { type: "dossier", dossier: state.dossier });
            toolResult = { ok: true, title, keywordsCount: keywords.length };
            break;
          }

          case "ask_clarification": {
            const question = asString(args.question) || "Could you clarify your interest?";
            const key = asString(args.key) || "clarification";
            const rawOptions = Array.isArray(args.options) ? (args.options as Record<string, unknown>[]) : [];
            const options = rawOptions.map((opt) => ({
              label: String(opt.label || opt.value || ""),
              value: String(opt.value || opt.label || ""),
              detail: opt.detail ? String(opt.detail) : undefined,
            }));
            state.clarifications = options;
            emit(sink, { type: "clarification", question, key, options });
            toolResult = { ok: true, question, optionsCount: options.length };
            break;
          }

          case "finish": {
            const fallback = args.fallback === true;
            const message = asString(args.message);
            if (message) emit(sink, { type: "agent-note", message });
            if (fallback) {
              state.fallbackRequested = true;
              toolResult = { ok: true, mode: "fallback" };
            } else if (!state.selected) {
              toolResult = { error: "call select_lanes before finishing, or pass fallback: true" };
              break;
            } else {
              toolResult = { ok: true, mode: "agent" };
            }
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(toolResult) });
            return finishRun(request, state, constraints, options, toolContext);
          }

          default:
            toolResult = { error: `unknown tool: ${name}` };
        }

        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(toolResult) });
      }
    }
    emit(sink, { type: "agent-note", message: "step budget reached — handing off to the deterministic pipeline" });
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "agent loop failed";
    emit(sink, { type: "agent-note", message: `agent unavailable (${message.slice(0, 120)}) — using the deterministic pipeline` });
    return null;
  }
}

function summarizeToolCall(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "resolve_entity":
      return `resolve “${asString(args.interest) ?? "?"}”${asString(args.type) ? ` as ${shortType(asString(args.type)!)}` : ""}`;
    case "expand_taste": {
      const bridges = asStringArray(args.bridgeIds);
      return bridges.length > 0 ? `second hop through ${bridges.length} bridge${bridges.length === 1 ? "" : "s"}` : "first-hop taste expansion";
    }
    case "score_candidates":
      return "score catalog candidates";
    case "check_budget": {
      const items = asStringArray(args.itemIds);
      return `check budget for ${items.length} item${items.length === 1 ? "" : "s"}`;
    }
    case "synthesize_dossier":
      return "synthesize cultural taste dossier";
    case "ask_clarification":
      return "request clarification from shopper";
    case "select_lanes":
      return "commit the three lanes";
    case "finish":
      return "finish the run";
    default:
      return name;
  }
}

async function finishRun(
  request: RecommendRequest,
  state: ToolRunState,
  constraints: NormalizedConstraints,
  options: { sink?: ProgressSink; shopperNote?: string },
  toolContext: ToolContext,
): Promise<RecommendResult | null> {
  if (!state.selected) return null;
  const { safe, surprise, bundle, rationale } = state.selected;
  const sink = options.sink;
  const toItem = (id: string): CandidateInternal | undefined => state.candidates.get(id);

  const laneIds: { lane: LaneKey; ids: string[] }[] = [
    { lane: "safe", ids: [safe] },
    { lane: "surprise", ids: [surprise] },
    { lane: "bundle", ids: bundle },
  ];

  const lanes = laneIds
    .map((entry) => ({
      lane: entry.lane,
      items: entry.ids.map(toItem).filter((item): item is CandidateInternal => item !== undefined),
    }))
    .filter((entry) => entry.items.length > 0);
  if (lanes.length === 0) return null;

  // The model may have chosen a solid set but the copy is still generated from
  // structured evidence, so every claim in the explanation is traceable.
  emit(sink, { type: "stage", stage: "explain", label: "Writing the receipt copy", detail: "grounded in the resolved taste signals" });
  const seedIds = new Set([...state.resolved.values()].map((entry) => entry.id));
  const sourceOf = (entry: CandidateInternal): GiftItem["source"] =>
    seedIds.has(entry.entityId) ? "direct" : entry.hops ? "discovery" : "adjacent";
  const explanations = await buildLaneExplanations({
    recipientName: request.recipientName,
    occasion: request.occasion,
    interests: [...state.resolved.values()].map((entry) => entry.input),
    budgetMax: constraints.budgetMax,
    notes: [request.notes, options.shopperNote].filter((entry): entry is string => typeof entry === "string" && entry.length > 0).join(" · ") || undefined,
    lanes: lanes.map((entry) => ({
      lane: entry.lane,
      items: entry.items.map((scored) => ({
        title: scored.catalog.title,
        brand: scored.catalog.brand,
        price: scored.catalog.price,
        category: scored.catalog.category,
        entityName: scored.entityName,
        affinityPct: Math.round(scored.affinity * 100),
        source: sourceOf(scored),
        matchedInterests: scored.contributors.map((contributor) => contributor.name),
      })),
    })),
  });

  const toGiftItem = (candidate: CandidateInternal): GiftItem => {
    const affinityPct = Math.round(candidate.affinity * 100);
    const source = sourceOf(candidate);
    const matchedInterests = candidate.contributors.map((entry) => entry.name);
    return {
      id: candidate.catalog.id,
      title: candidate.catalog.title,
      brand: candidate.catalog.brand,
      price: candidate.catalog.price,
      currency: candidate.catalog.currency,
      ...catalogImage(candidate.catalog),
      buyUrl: candidate.catalog.buyUrl,
      category: candidate.catalog.category,
      description: candidate.catalog.description,
      inventory: candidate.catalog.inventory,
      entityName: candidate.entityName,
      entityType: candidate.entityType,
      affinity: candidate.affinity,
      affinityPct,
      source,
      matchedInterests,
      contributors: candidate.contributors,
      hops: candidate.hops,
      reason: itemReason({
        title: candidate.catalog.title,
        brand: candidate.catalog.brand,
        price: candidate.catalog.price,
        category: candidate.catalog.category,
        entityName: candidate.entityName,
        affinityPct,
        source,
        matchedInterests,
      }),
    };
  };

  const picks: GiftPick[] = lanes.map(({ lane, items }) => ({
    lane,
    headline: explanations[lane]?.headline ?? defaultHeadline(lane),
    explanation: explanations[lane]?.explanation ?? "",
    items: items.map(toGiftItem),
    totalPrice: items.reduce((sum, entry) => sum + entry.catalog.price, 0),
  }));

  for (const pick of picks) {
    emit(sink, { type: "selection", lane: pick.lane, headline: pick.headline, titles: pick.items.map((item) => item.title) });
  }

  const laneSet = new Set(lanes.flatMap((entry) => entry.items.map((item) => item.itemId)));
  const shelf = diverseDiscoveries(
    [...state.candidates.values()].filter((entry) => !laneSet.has(entry.itemId)),
    (entry) => ({ id: entry.itemId, category: entry.category, entity: entry.entityId, affinity: entry.affinity }),
  ).map(toGiftItem);

  const expansions = [...state.expansions.values()].sort((a, b) => b.affinity - a.affinity);
  const tasteMap: TasteMapEntry[] = [];
  const perType = new Map<string, number>();
  for (const entry of expansions) {
    if (tasteMap.length >= 14) break;
    const count = perType.get(entry.type) ?? 0;
    if (count >= 3) continue;
    perType.set(entry.type, count + 1);
    tasteMap.push({
      type: entry.type,
      entityName: entry.name,
      affinityPct: Math.round(entry.affinity * 100),
      hops: entry.hops,
      via: entry.hops === 2 ? entry.via : undefined,
    });
  }

  // Edges worth drawing: each second-hop discovery back to the bridge it
  // came through, then the taste signals that justified the final picks.
  const connections: TasteConnection[] = [];
  const seenEdge = new Set<string>();
  for (const second of expansions.filter((entry) => entry.hops === 2)) {
    const bridgeName = second.via ?? state.hop1.find((bridge) => bridge.name)?.name;
    if (!bridgeName) continue;
    const key = `${bridgeName}->${second.name}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    connections.push({
      from: bridgeName,
      to: second.name,
      via: bridgeName,
      affinityPct: Math.round(second.affinity * 100),
      hops: 2,
      bridgeStory: `${bridgeName} acts as an aesthetic bridge to ${second.name}, connecting sensibilities across creative mediums.`,
    });
    if (connections.length >= 6) break;
  }
  for (const candidate of state.candidates.values()) {
    if (connections.length >= 8) break;
    for (const contributor of candidate.contributors.slice(0, 1)) {
      const key = `${contributor.name}->${candidate.entityName}`;
      if (seenEdge.has(key)) continue;
      seenEdge.add(key);
      connections.push({
        from: contributor.name,
        to: candidate.entityName,
        via: contributor.via,
        affinityPct: Math.round(candidate.affinity * 100),
        hops: candidate.hops ?? 0,
        bridgeStory: `${candidate.entityName} shares direct cultural affinity with ${contributor.name} across Qloo's taste graph.`,
      });
    }
  }

  const warnings = [...toolContext.warnings];
  if (picks.length < 3) warnings.push("The agent produced fewer than three lanes for this run.");
  if (rationale) emit(sink, { type: "agent-note", message: `choice rationale — ${rationale}` });

  return {
    resolvedInterests: [...state.resolved.values()].map((entry) => ({
      input: entry.input,
      matchedName: entry.name,
      type: shortType(entry.type),
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
    dossier: state.dossier || buildFallbackDossier(request, tasteMap),
  };
}

export function agentAvailable(): boolean {
  return Boolean(process.env.LLM_API_KEY?.trim());
}

export { laneLabel, popularityOf, clamp01 };
