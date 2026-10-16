export type LaneKey = "safe" | "surprise" | "bundle";

export interface InterestInput {
  name: string;
  type?: string;
}

export interface RecommendRequest {
  recipientName?: string;
  interests: (string | InterestInput)[];
  budget?: { min?: number; max?: number };
  occasion?: string;
  notes?: string;
  candidateItemIds?: string[];
}

// ---------- refinement loop ----------

export type SessionMood = "adventurous" | "grounded";

export interface SessionConstraints {
  budgetMin?: number;
  budgetMax?: number;
  avoidItemIds: string[];
  priorItemIds: string[];
  boostInterests: string[];
  muteInterests: string[];
  mood?: SessionMood;
}

export function emptyConstraints(): SessionConstraints {
  return { avoidItemIds: [], priorItemIds: [], boostInterests: [], muteInterests: [] };
}

export type RefineAction =
  | { kind: "budget"; newMin?: number; newMax?: number }
  | { kind: "avoid"; itemIds: string[] }
  | { kind: "more"; lane: LaneKey; itemIds: string[] }
  | { kind: "reset-picks" }
  | { kind: "mood"; mood: SessionMood | "clear" }
  | { kind: "boost"; interest: string; op: "boost" | "mute" | "clear" }
  | { kind: "note"; text: string };

export interface AppliedRefinement {
  constraints: SessionConstraints;
  notes: string[];
}

// ---------- agent transcript ----------

export type StageName = "start" | "resolve" | "expand" | "hop2" | "score" | "select" | "explain" | "done";

export type AgentEvent =
  | { type: "stage"; stage: StageName; label: string; detail?: string }
  | { type: "interest"; input: string; matchedName: string; entityType: string; note?: string }
  | { type: "expansion"; entityType: string; name: string; affinityPct: number; hops: number; via?: string }
  | { type: "warning"; message: string }
  | { type: "selection"; lane: LaneKey; headline: string; titles: string[] }
  | { type: "agent-note"; message: string }
  | { type: "error"; message: string }
  | { type: "result"; result: RecommendResult; constraints: SessionConstraints };

export type ProgressSink = (event: AgentEvent) => void;

// ---------- recommendation payload ----------

export interface Contributor {
  name: string;
  sharePct: number;
  via?: string;
}

export interface GiftItem {
  id: string;
  title: string;
  brand: string;
  price: number;
  currency: string;
  image: string | null;
  buyUrl: string;
  category: string;
  description: string;
  inventory: "in_stock" | "low_stock" | "preorder";
  entityName: string;
  entityType: string;
  affinity: number;
  affinityPct: number;
  source: "direct" | "discovery" | "adjacent";
  matchedInterests: string[];
  reason: string;
  contributors?: Contributor[];
  hops?: number;
}

export interface GiftPick {
  lane: LaneKey;
  headline: string;
  explanation: string;
  items: GiftItem[];
  totalPrice: number;
}

export interface TasteMapEntry {
  type: string;
  entityName: string;
  affinityPct: number;
  hops?: number;
  via?: string;
}

export interface TasteConnection {
  from: string;
  to: string;
  via?: string;
  affinityPct: number;
  hops: number;
}

export interface InterestAlternate {
  type: string;
  name: string;
  popularity: number;
  urn?: string;
}

export interface RecommendResult {
  resolvedInterests: { input: string; matchedName: string; type: string; alternates: InterestAlternate[]; candidates: InterestAlternate[] }[];
  tasteMap: TasteMapEntry[];
  connections: TasteConnection[];
  picks: GiftPick[];
  shelf: GiftItem[];
  warnings: string[];
}
