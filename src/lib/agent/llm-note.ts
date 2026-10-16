import type { RefineAction } from "./types";

interface LlmAction {
  kind?: string;
  newMin?: unknown;
  newMax?: unknown;
  mood?: unknown;
  interest?: unknown;
  op?: unknown;
}

const MAX_ACTIONS = 6;

const SYSTEM_PROMPT = [
  "You are the action interpreter for Tasteprint, a gift-recommendation agent.",
  "The shopper typed free-text feedback about the current gift picks.",
  "Convert it into machine actions from this fixed vocabulary and nothing else:",
  '- {"kind":"budget","newMin":number,"newMax":number} — raise/lower the budget in USD (1-10000; newMax >= 5; omit newMin to keep it)',
  '- {"kind":"mood","mood":"adventurous"} or {"kind":"mood","mood":"grounded"} — adventurous = bold, risky, eclectic picks; grounded = safe, well-known, mainstream picks',
  '- {"kind":"boost","interest":string,"op":"boost"} — they love this interest more than originally stated; interest must be one of the provided interest names',
  '- {"kind":"boost","interest":string,"op":"mute"} — they dislike or want less of this interest',
  '- {"kind":"boost","interest":string,"op":"clear"} — neutral weight restored',
  '- {"kind":"reset-picks"} — they want previously shown picks back in rotation',
  'Vague praise or topics you cannot map ("loves jazz" when Jazz is not in the interests) must be dropped.',
  "Return at most 6 actions. If nothing maps, return an empty array.",
  'Respond with strict JSON: {"actions": [ ... ]}',
].join(" ");

function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function normalizeInterestNames(values: (string | { name: string })[]): { names: string[]; lowerToCanonical: Map<string, string> } {
  const lowerToCanonical = new Map<string, string>();
  for (const entry of values) {
    const name = typeof entry === "string" ? entry : entry?.name;
    if (typeof name === "string" && name.trim().length > 0) {
      lowerToCanonical.set(name.toLowerCase().trim(), name.trim());
    }
  }
  return { names: [...lowerToCanonical.values()], lowerToCanonical };
}

function validateActions(raw: unknown, lowerToCanonical: Map<string, string>): RefineAction[] {
  if (!Array.isArray(raw)) return [];
  const out: RefineAction[] = [];
  for (const entry of raw as LlmAction[]) {
    if (out.length >= MAX_ACTIONS) break;
    if (typeof entry !== "object" || entry === null) continue;
    switch (entry.kind) {
      case "budget": {
        const min = typeof entry.newMin === "number" && Number.isFinite(entry.newMin) ? Math.round(entry.newMin) : undefined;
        const max = typeof entry.newMax === "number" && Number.isFinite(entry.newMax) ? Math.round(entry.newMax) : undefined;
        if (min === undefined && max === undefined) break;
        if (min !== undefined && (min < 0 || min > 10000)) break;
        if (max !== undefined && (max < 5 || max > 10000)) break;
        const action: RefineAction = { kind: "budget" };
        if (min !== undefined) action.newMin = min;
        if (max !== undefined) action.newMax = max;
        out.push(action);
        break;
      }
      case "mood": {
        if (entry.mood === "adventurous" || entry.mood === "grounded" || entry.mood === "clear") {
          out.push({ kind: "mood", mood: entry.mood });
        }
        break;
      }
      case "boost": {
        const rawInterest = typeof entry.interest === "string" ? entry.interest.trim() : "";
        const interest = lowerToCanonical.get(rawInterest.toLowerCase());
        if (!interest) break;
        if (entry.op === "boost" || entry.op === "mute" || entry.op === "clear") {
          out.push({ kind: "boost", interest, op: entry.op });
        }
        break;
      }
      case "reset-picks": {
        out.push({ kind: "reset-picks" });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

export async function interpretNote(text: string, interests: (string | { name: string })[]): Promise<RefineAction[] | null> {
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (!apiKey) return null;
  const { names, lowerToCanonical } = normalizeInterestNames(interests);
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
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify({ note: text, interests: names }) },
        ],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    const json = extractJson(content);
    if (!json) return null;
    const parsed = JSON.parse(json) as { actions?: unknown };
    return validateActions(parsed.actions, lowerToCanonical);
  } catch {
    return null;
  }
}
