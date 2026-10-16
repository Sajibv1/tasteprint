import { type AppliedRefinement, type RecommendRequest, type RefineAction, type SessionConstraints } from "./types";

const NOTE_MB = /(?:under|below|less than|max(?:imum)?(?: of)?(?: \$)?|budget (?:of )?|\$)\s*\$?(\d{2,5})/i;
const NOTE_MORE_THAN = /(at least|no less than|minimum of|more than|over)\s*\$?(\d{2,5})/i;
const NOTE_ADVENTUROUS = /adventur|bolder|riskier|wild(er)?\b|unexpected|surprise me/i;
const NOTE_GROUNDED = /grounded|safer|safe(r)? side|well[- ]?known|mainstream|conventional|stick to/i;
const NOTE_RESET = /(fresh picks|start over|reset\b)/i;

function clampBudgetAction(raw: number): RefineAction | null {
  const value = Math.round(raw);
  if (value < 5 || value > 10_000) return null;
  return { kind: "budget", newMax: value };
}

export function noteToActions(text: string, interests: (string | { name: string })[]): RefineAction[] {
  const actions: RefineAction[] = [];
  const names = interests.map((entry) => (typeof entry === "string" ? entry : entry.name)).filter(Boolean);

  const budgetMatch = text.match(NOTE_MB);
  if (budgetMatch) {
    const action = clampBudgetAction(Number(budgetMatch[1]));
    if (action) actions.push(action);
  }
  const floorMatch = text.match(NOTE_MORE_THAN);
  if (floorMatch) {
    const value = Math.round(Number(floorMatch[2]));
    if (value >= 5 && value <= 10_000) actions.push({ kind: "budget", newMin: value });
  }
  if (NOTE_ADVENTUROUS.test(text)) actions.push({ kind: "mood", mood: "adventurous" });
  else if (NOTE_GROUNDED.test(text)) actions.push({ kind: "mood", mood: "grounded" });
  if (NOTE_RESET.test(text)) actions.push({ kind: "reset-picks" });

  for (const name of names) {
    const pattern = new RegExp(`(more|very|really|loves?|obsessed( with)?)\\s+(with\\s+)?${escapeRegExp(name)}\\b`, "i");
    const mutePattern = new RegExp(`(less|skip|no|not|don'?t|avoid|drop)\\s+(with\\s+)?(about\\s+)?${escapeRegExp(name)}\\b`, "i");
    if (mutePattern.test(text)) actions.push({ kind: "boost", interest: name, op: "mute" });
    else if (pattern.test(text)) actions.push({ kind: "boost", interest: name, op: "boost" });
  }
  return actions;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function applyRefinement(
  action: RefineAction,
  constraints: SessionConstraints,
  request: RecommendRequest,
): AppliedRefinement {
  const next: SessionConstraints = {
    ...constraints,
    avoidItemIds: [...constraints.avoidItemIds],
    priorItemIds: [...constraints.priorItemIds],
    boostInterests: [...constraints.boostInterests],
    muteInterests: [...constraints.muteInterests],
  };
  const notes: string[] = [];

  switch (action.kind) {
    case "budget":
      if (action.newMin !== undefined) next.budgetMin = Math.max(0, Math.round(action.newMin));
      if (action.newMax !== undefined) next.budgetMax = Math.max(5, Math.round(action.newMax));
      notes.push(`budget set to $${next.budgetMin ?? 0}–$${next.budgetMax ?? "?"}`);
      break;

    case "avoid":
      for (const id of action.itemIds) if (!next.avoidItemIds.includes(id)) next.avoidItemIds.push(id);
      next.priorItemIds = next.priorItemIds.filter((id) => !action.itemIds.includes(id));
      notes.push(`${action.itemIds.length} pick${action.itemIds.length === 1 ? "" : "s"} won't come back`);
      break;

    case "more":
      for (const id of action.itemIds) {
        if (!next.avoidItemIds.includes(id) && !next.priorItemIds.includes(id)) next.priorItemIds.push(id);
      }
      notes.push(`looking for a fresh ${action.lane} pick`);
      break;

    case "reset-picks":
      next.priorItemIds = [];
      notes.push("previously shown picks are back in rotation");
      break;

    case "mood":
      next.mood = action.mood === "clear" ? undefined : action.mood;
      notes.push(next.mood ? `tuning toward ${next.mood} territory` : "mood bias cleared");
      break;

    case "boost": {
      const lower = action.interest.toLowerCase();
      next.boostInterests = next.boostInterests.filter((entry) => entry.toLowerCase() !== lower);
      next.muteInterests = next.muteInterests.filter((entry) => entry.toLowerCase() !== lower);
      if (action.op === "boost") {
        next.boostInterests.push(action.interest);
        notes.push(`leaning harder into ${action.interest}`);
      } else if (action.op === "mute") {
        next.muteInterests.push(action.interest);
        notes.push(`dialing ${action.interest} down in the signal mix`);
      } else {
        notes.push(`${action.interest} back at neutral weight`);
      }
      break;
    }

    case "note": {
      const parsed = noteToActions(action.text, request.interests ?? []);
      if (parsed.length === 0) {
        notes.push(`logged “${action.text.slice(0, 80)}” — no structural change, but the copy takes it into account`);
        break;
      }
      let base = next;
      for (const sub of parsed) {
        const applied = applyRefinement(sub, base, request);
        base = applied.constraints;
        notes.push(...applied.notes);
      }
      Object.assign(next, base);
      break;
    }
  }
  return { constraints: next, notes };
}
