import type { LaneKey } from "./types";

export interface LaneCopy {
  headline: string;
  explanation: string;
}

export interface ExplainedItem {
  title: string;
  brand: string;
  price: number;
  category: string;
  entityName: string;
  affinityPct: number;
  source: "direct" | "discovery" | "adjacent";
  matchedInterests: string[];
}

export interface LaneExplanationInput {
  lane: LaneKey;
  items: ExplainedItem[];
}

export interface ExplanationContext {
  recipientName?: string;
  occasion?: string;
  interests: string[];
  budgetMax: number;
  notes?: string;
  lanes: LaneExplanationInput[];
}

const SYSTEM_PROMPT = [
  "You write gift recommendation copy for Tasteprint, a gift discovery app powered by Qloo's cultural taste graph.",
  "You receive structured evidence about a recipient's cultural taste and the gifts matched to it.",
  "Rules: use ONLY the provided data; never invent products, prices, or facts about the recipient;",
  "each explanation is 2-3 sentences, warm, specific and confident; no markdown; headline is at most 8 words with no ending period.",
  'Respond with strict JSON: {"safe": {"headline": "", "explanation": ""}, "surprise": {"headline": "", "explanation": ""}, "bundle": {"headline": "", "explanation": ""}}',
].join(" ");

function isLaneCopy(value: unknown): value is LaneCopy {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.headline === "string" && typeof record.explanation === "string";
}

async function llmExplanations(context: ExplanationContext): Promise<Partial<Record<LaneKey, LaneCopy>> | null> {
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (!apiKey) return null;
  const baseUrl = (process.env.LLM_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.LLM_MODEL?.trim() || "gpt-4o-mini";
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(context) },
        ],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) return null;
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const out: Partial<Record<LaneKey, LaneCopy>> = {};
    for (const lane of ["safe", "surprise", "bundle"] as LaneKey[]) {
      if (isLaneCopy(parsed[lane])) out[lane] = parsed[lane] as LaneCopy;
    }
    return out;
  } catch {
    return null;
  }
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "their taste";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function templateCopy(lane: LaneKey, context: ExplanationContext, input: LaneExplanationInput): LaneCopy {
  const names = joinNames(context.interests.slice(0, 3));
  const item = input.items[0];
  switch (lane) {
    case "safe":
      return {
        headline: "Closest to their taste",
        explanation: `Of everything scored, ${item.title} lands closest to what they already love — a ${item.affinityPct}% affinity with their taste in ${joinNames(item.matchedInterests.length > 0 ? item.matchedInterests : context.interests.slice(0, 2))} across Qloo's graph. It is the pick that is almost impossible to get wrong.`,
      };
    case "surprise":
      return {
        headline: "The unexpected connection",
        explanation: `This one is a leap: Qloo's taste graph links their love of ${names} to ${item.entityName} at ${item.affinityPct}%. It sits outside their usual orbit, which is exactly why it will feel like you know them better than they expected.`,
      };
    case "bundle":
      return {
        headline: "One taste story, three chapters",
        explanation: `A curated ${input.items.length}-piece set spanning ${joinNames(input.items.map((entry) => entry.category))} — each piece anchored in a different corner of their taste (${names}), and together a complete unboxing moment.`,
      };
  }
}

export function defaultHeadline(lane: LaneKey): string {
  switch (lane) {
    case "safe":
      return "Closest to their taste";
    case "surprise":
      return "The unexpected connection";
    case "bundle":
      return "One taste story, three chapters";
  }
}

export async function buildLaneExplanations(context: ExplanationContext): Promise<Record<LaneKey, LaneCopy>> {
  const llm = await llmExplanations(context);
  const result = {} as Record<LaneKey, LaneCopy>;
  for (const input of context.lanes) {
    const fromLlm = llm?.[input.lane];
    result[input.lane] = fromLlm ?? templateCopy(input.lane, context, input);
  }
  return result;
}

export function itemReason(item: ExplainedItem): string {
  switch (item.source) {
    case "direct":
      return `Direct match with their taste (${item.affinityPct}% affinity in Qloo's graph).`;
    case "discovery":
      return `Discovered by connecting their interests to ${item.entityName} (${item.affinityPct}% affinity).`;
    case "adjacent":
      return `A cross-domain connection surfaced by Qloo's graph (${item.affinityPct}% affinity).`;
  }
}
