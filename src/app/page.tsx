"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";
import type {
  AgentEvent,
  GiftItem,
  GiftPick,
  LaneKey,
  RecommendResult,
  RefineAction,
  SessionConstraints,
  TasteMapEntry,
} from "@/lib/agent/types";
import { emptyConstraints } from "@/lib/agent/types";

const SUGGESTIONS = [
  "Radiohead",
  "Björk",
  "Studio Ghibli",
  "Muji",
  "Sally Rooney",
  "Dune",
  "Frank Ocean",
  "In the Mood for Love",
];

const OCCASIONS = ["Birthday", "Anniversary", "Holidays", "Housewarming", "Just because"];

const PERSONAS: RecentRun[] = [
  {
    id: "persona-ghibli",
    ts: 0,
    recipientName: "Priya",
    occasion: "Birthday",
    interests: ["Björk", "Studio Ghibli", "Sally Rooney"],
    budgetMax: 80,
  },
  {
    id: "persona-scifi",
    ts: 0,
    recipientName: "Devon",
    occasion: "Holidays",
    interests: ["Blade Runner", "Dune", "Frank Ocean"],
    budgetMax: 120,
  },
  {
    id: "persona-dj",
    ts: 0,
    recipientName: "Lena",
    occasion: "Just because",
    interests: ["Frank Ocean", "SZA", "Muji"],
    budgetMax: 60,
  },
];

const LANE_META: Record<LaneKey, { label: string; tone: "cobalt" | "pink" | "butter"; delay: number }> = {
  safe: { label: "Safe bet", tone: "cobalt", delay: 0 },
  surprise: { label: "Wild card", tone: "pink", delay: 120 },
  bundle: { label: "The bundle", tone: "butter", delay: 240 },
};

const SOURCE_LABEL: Record<GiftItem["source"], string> = {
  direct: "direct match",
  discovery: "cross-domain find",
  adjacent: "close match",
};

const SOURCE_CLASS: Record<GiftItem["source"], string> = {
  direct: "border-cobalt text-cobalt",
  discovery: "border-pink text-pink-deep",
  adjacent: "border-fog text-muted",
};

type Weight = "neutral" | "boosted" | "muted";

interface RecentRun {
  id: string;
  recipientName: string;
  occasion: string;
  interests: string[];
  budgetMax: number;
  ts: number;
}

function buildRecentRun(seed: { recipientName: string; occasion: string; interests: string[]; budgetMax: number }): RecentRun {
  return { id: `r${Date.now()}`, ts: Date.now(), ...seed };
}

const RECENTS_KEY = "tasteprint.runs.v1";

function shareEncode(payload: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function shareDecode(value: string): Record<string, unknown> | null {
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/")).replace(/[\u0000-\u0010]/g, "");
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(decoded) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function Stamp({ label, tone, delay = 0 }: { label: string; tone: "cobalt" | "pink" | "butter"; delay?: number }) {
  const tones = {
    cobalt: "bg-cobalt text-white",
    pink: "bg-pink text-white",
    butter: "bg-butter text-ink",
  };
  return (
    <span className="stamp-in inline-block" style={{ "--stamp-delay": `${delay}ms` } as CSSProperties}>
      <span className={`inline-block border-2 border-ink px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-[0.18em] ${tones[tone]}`}>
        {label}
      </span>
    </span>
  );
}

function Meter({ value }: { value: number }) {
  const filled = Math.round(Math.max(0, Math.min(100, value)) / 10);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex gap-[3px]" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, index) => (
          <span key={index} className={`h-2.5 w-1.5 ${index < filled ? "bg-cobalt" : "bg-fog"}`} />
        ))}
      </span>
      <span className="font-mono text-xs font-semibold">{value}%</span>
    </span>
  );
}

function ContributorBar({ item }: { item: GiftItem }) {
  const contributors = item.contributors ?? [];
  if (contributors.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border border-ink/10 bg-paper px-2 py-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted">why</span>
      {contributors.map((contributor) => (
        <span key={`${contributor.name}-${contributor.sharePct}`} className="font-mono text-xs text-ink">
          {contributor.name} · {contributor.sharePct}%
          {contributor.via && <span className="text-muted"> (via {contributor.via})</span>}
        </span>
      ))}
      {item.hops === 2 && (
        <span className="border border-pink px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-pink-deep">
          2 hops away
        </span>
      )}
    </div>
  );
}

function GiftCard({
  item,
  compact = false,
  onAvoid,
  busy,
}: {
  item: GiftItem;
  compact?: boolean;
  onAvoid?: (item: GiftItem) => void;
  busy: boolean;
}) {
  return (
    <article className="flex gap-3.5 border border-ink/15 bg-paper p-3.5">
      <Image
        src={item.image}
        alt={item.title}
        width={compact ? 160 : 288}
        height={compact ? 160 : 288}
        className={`${compact ? "size-16" : "size-24"} flex-none border border-ink/15 object-cover`}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${SOURCE_CLASS[item.source]}`}>
            {SOURCE_LABEL[item.source]}
          </span>
          {item.inventory === "low_stock" && (
            <span className="border border-ink bg-butter px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink">
              low stock
            </span>
          )}
        </div>
        <h4 className="font-bold leading-snug text-ink">{item.title}</h4>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="font-mono text-sm font-semibold">${item.price}</span>
          <span className="text-xs text-muted">{item.brand}</span>
          <span className="text-xs text-muted">{item.category}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">taste match</span>
          <Meter value={item.affinityPct} />
        </div>
        <ContributorBar item={item} />
        <p className="text-sm leading-relaxed text-muted">{item.reason}</p>
        <div className="flex items-center gap-4">
          <a
            href={item.buyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block font-mono text-xs font-semibold uppercase tracking-wider text-cobalt underline decoration-cobalt/40 underline-offset-4 hover:text-cobalt-deep"
          >
            View product
          </a>
          {onAvoid && (
            <button
              type="button"
              disabled={busy}
              title="Skip products like this in future runs"
              onClick={() => onAvoid(item)}
              className="font-mono text-xs uppercase tracking-wider text-muted underline decoration-dotted underline-offset-4 hover:text-stamp disabled:opacity-40"
            >
              not for them
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function LaneCard({ pick, onRefine, busy }: { pick: GiftPick; onRefine: (action: RefineAction) => void; busy: boolean }) {
  const meta = LANE_META[pick.lane];
  return (
    <article
      className="lane-in relative mt-4 border-2 border-ink bg-white p-5 pt-8"
      style={{ "--lane-delay": `${meta.delay}ms` } as CSSProperties}
    >
      <div className="absolute -top-4 left-4">
        <Stamp label={meta.label} tone={meta.tone} delay={meta.delay + 150} />
      </div>
      <h3 className="font-display text-2xl leading-tight text-ink">{pick.headline}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{pick.explanation}</p>
      <div className="mt-4 space-y-3">
        {pick.items.map((item) => (
          <GiftCard
            key={item.id}
            item={item}
            compact={pick.lane === "bundle" && pick.items.length > 1}
            onAvoid={(picked) => onRefine({ kind: "avoid", itemIds: [picked.id] })}
            busy={busy}
          />
        ))}
      </div>
      {pick.items.length > 1 && (
        <p className="mt-4 flex items-baseline justify-between border-t border-dashed border-ink/30 pt-3">
          <span className="font-mono text-xs uppercase tracking-wider text-muted">Bundle total</span>
          <span className="font-mono text-base font-semibold text-ink">${pick.totalPrice}</span>
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-dashed border-fog pt-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onRefine({ kind: "more", lane: pick.lane, itemIds: pick.items.map((item) => item.id) })}
          className="border border-cobalt px-2.5 py-1 font-mono text-xs text-cobalt transition hover:bg-cobalt hover:text-white disabled:opacity-40"
        >
          another like this
        </button>
      </div>
    </article>
  );
}

function transcriptLine(event: AgentEvent): string | null {
  switch (event.type) {
    case "stage":
      return `${event.label}${event.detail ? ` — ${event.detail}` : ""}`;
    case "interest":
      return `matched "${event.input}" → ${event.matchedName} (${event.entityType})${event.note ? ` · ${event.note}` : ""}`;
    case "expansion":
      return `taste signal: ${event.name} · ${event.affinityPct}%${event.hops === 2 ? (event.via ? ` · 2 hops via ${event.via}` : " · 2 hops") : ""}`;
    case "warning":
      return `note — ${event.message}`;
    case "agent-note":
      return event.message;
    case "selection":
      return `${LANE_META[event.lane].label}: ${event.titles.join(" + ")}`;
    default:
      return null;
  }
}

const WEIGHT_MARK: Record<Weight, string> = { neutral: "+", boosted: "+↑", muted: "+↓" };
const WEIGHT_TITLE: Record<Weight, string> = {
  neutral: "Click to lean harder into this interest",
  boosted: "Leaning into this — click to dial it down",
  muted: "This is dialed down — click to reset",
};

export default function Home() {
  const [interests, setInterests] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [occasion, setOccasion] = useState("");
  const [budgetMax, setBudgetMax] = useState(100);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [constraints, setConstraints] = useState<SessionConstraints>(emptyConstraints);
  const [status, setStatus] = useState<"idle" | "loading" | "refining" | "done" | "error">("idle");
  const [transcript, setTranscript] = useState<AgentEvent[]>([]);
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [refineLog, setRefineLog] = useState<string[]>([]);
  const [recents, setRecents] = useState<RecentRun[]>([]);
  const [share, setShare] = useState<string>("");
  const resultsRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLOListElement>(null);

  const busy = status === "loading" || status === "refining";

  useEffect(() => {
    queueMicrotask(() => {
      let runs: RecentRun[] = [];
      try {
        runs = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]") as RecentRun[];
      } catch {
        runs = [];
      }
      setRecents(Array.isArray(runs) ? runs : []);
      const params = new URLSearchParams(window.location.search);
      const q = params.get("q");
      if (!q) return;
      const decoded = shareDecode(q);
      if (!decoded) return;
      if (Array.isArray(decoded.interests)) {
        const list = (decoded.interests as unknown[]).filter((entry): entry is string => typeof entry === "string").slice(0, 8);
        setInterests(list);
      }
      if (typeof decoded.n === "string") setRecipientName(decoded.n);
      if (typeof decoded.o === "string" && OCCASIONS.includes(decoded.o)) setOccasion(decoded.o);
      if (typeof decoded.b === "number") setBudgetMax(Math.min(300, Math.max(10, decoded.b)));
    });
  }, []);

  useEffect(() => {
    if (!recents.length) return;
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
    } catch {
      // private mode or full storage — recents are a nicety, not a requirement
    }
  }, [recents]);

  useEffect(() => {
    if (!transcriptRef.current || (status !== "loading" && status !== "refining")) return;
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [transcript, status]);

  function addInterest(value: string) {
    const clean = value.trim().replace(/\s+/g, " ");
    if (!clean) return;
    setInterests((current) =>
      current.some((entry) => entry.toLowerCase() === clean.toLowerCase()) || current.length >= 8
        ? current
        : [...current, clean],
    );
    setDraft("");
  }

  function removeInterest(value: string) {
    setInterests((current) => current.filter((entry) => entry !== value));
    setOverrides((current) => {
      const next = { ...current };
      delete next[value];
      return next;
    });
  }

  function buildRequest() {
    return {
      recipientName: recipientName.trim() || undefined,
      interests: interests.map((name) => (overrides[name] ? { name, type: overrides[name] } : name)),
      occasion: occasion || undefined,
      budget: { min: 0, max: budgetMax },
    };
  }

  async function streamRun(parameters: { constraints?: SessionConstraints; action?: RefineAction }) {
    const response = await fetch("/api/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: parameters.action ? "refine" : "recommend",
        request: buildRequest(),
        action: parameters.action,
        constraints: parameters.constraints,
      }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(typeof payload?.error === "string" ? payload.error : "The gift agent hit a snag.");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("The gift agent stopped mid-sentence.");
    const decoder = new TextDecoder();
    let buffer = "";
    let failure: string | null = null;
    let finished = false;

    while (!finished && !failure) {
      const read = await reader.read();
      if (read.done) break;
      buffer += decoder.decode(read.value, { stream: true });
      let separator = buffer.indexOf("\n\n");
      while (separator !== -1 && !finished && !failure) {
        const chunk = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        separator = buffer.indexOf("\n\n");
        const line = chunk.split("\n").find((entry) => entry.startsWith("data: "));
        if (!line) continue;
        const event = JSON.parse(line.slice(6)) as AgentEvent;
        setTranscript((current) => [...current, event]);
        if (event.type === "agent-note" && parameters.action) setRefineLog((current) => [...current, event.message]);
        if (event.type === "error") {
          failure = event.message;
        } else if (event.type === "result") {
          finished = true;
          setResult(event.result);
          setConstraints(event.constraints);
          const effectiveBudget = event.constraints.budgetMax ?? budgetMax;
          updateShareAndRecents(event.result, effectiveBudget);
          requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
        }
      }
    }
    if (failure) throw new Error(failure);
  }

  function updateShareAndRecents(recommendResult: RecommendResult, effectiveBudget: number) {
    const encoded = shareEncode({
      n: recipientName.trim(),
      i: interests,
      o: occasion,
      b: budgetMax,
    });
    const url = `${window.location.origin}${window.location.pathname}?q=${encoded}`;
    setShare(url);
    try {
      window.history.replaceState(null, "", url);
    } catch {
      // replaceState can fail in sandboxed iframes; sharing still works via the copy button
    }
    const entry = buildRecentRun({
      recipientName: recipientName.trim(),
      occasion,
      interests: [...interests],
      budgetMax: effectiveBudget,
    });
    setRecents((current) => {
      const signature = `${entry.recipientName}|${entry.occasion}|${JSON.stringify(entry.interests.map((value) => value.toLowerCase()))}`;
      const deduped = current.filter((run) => {
        const runSignature = `${run.recipientName}|${run.occasion}|${JSON.stringify(run.interests.map((value) => value.toLowerCase()))}`;
        return runSignature !== signature;
      });
      return [entry, ...deduped].slice(0, 8);
    });
  }

  async function startRecommend(effectiveOverrides: Record<string, string>) {
    if (interests.length === 0 || busy) return;
    const merged = { ...overrides, ...effectiveOverrides };
    if (effectiveOverrides && Object.keys(effectiveOverrides).length > 0) setOverrides(merged);
    setStatus("loading");
    setTranscript([]);
    setConstraints(emptyConstraints());
    setRefineLog([]);
    setError(null);
    try {
      await streamRun({});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
      setStatus("error");
      return;
    }
    setStatus("done");
  }

  async function refine(action: RefineAction) {
    if (busy) return;
    setStatus("refining");
    setTranscript([]);
    setError(null);
    setRefineLog([]);
    try {
      await streamRun({ action, constraints });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
      setStatus("error");
      return;
    }
    setStatus("done");
  }

  function setNoteNoteNotice() {
    return noteDraft.trim().length > 0;
  }

  function weightOf(interest: string): Weight {
    const lower = interest.toLowerCase();
    if (constraints.boostInterests.some((entry) => entry.toLowerCase() === lower)) return "boosted";
    if (constraints.muteInterests.some((entry) => entry.toLowerCase() === lower)) return "muted";
    return "neutral";
  }

  function cycleWeight(interest: string) {
    const current = weightOf(interest);
    const op = current === "neutral" ? "boost" : current === "boosted" ? "mute" : "clear";
    void refine({ kind: "boost", interest, op });
  }

  function loadRecent(run: RecentRun) {
    setRecipientName(run.recipientName);
    setInterests(run.interests);
    setOccasion(run.occasion);
    setBudgetMax(run.budgetMax);
  }

  const appliedBudget = constraints.budgetMax ?? budgetMax;

  const tasteByType = new Map<string, TasteMapEntry[]>();
  for (const entry of result?.tasteMap ?? []) {
    const list = tasteByType.get(entry.type) ?? [];
    list.push(entry);
    tasteByType.set(entry.type, list);
  }

  const transcriptLines = transcript.flatMap((event) => {
    const line = transcriptLine(event);
    return line ? [{ event, line }] : [];
  });
  const lastStageIndex = (() => {
    let index = -1;
    transcriptLines.forEach((entry, position) => {
      if (entry.event.type === "stage") index = position;
    });
    return index;
  })();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-5 py-10 sm:px-8">
      <header className="flex flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center bg-ink font-display text-lg text-butter">T</span>
            <span className="font-display text-xl tracking-wide text-ink">TASTEPRINT</span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            Gift intelligence, powered by Qloo
          </span>
        </div>
        <div>
          <h1 className="w-fit bg-butter px-4 py-2 font-display text-4xl leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Gifts that prove you know their taste.
          </h1>
          <p className="mt-5 max-w-2xl leading-relaxed text-muted">
            Tell Tasteprint who they are and what they love. It reads their cultural taste print across music, film,
            books and design with Qloo&apos;s taste graph — then returns three picks with the receipts: a safe bet, a
            wild card, and a curated bundle. React to the picks and watch it re-think live.
          </p>
        </div>
      </header>

      <section className="border-2 border-ink bg-white">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink bg-ink px-5 py-3">
          <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-paper">
            Job ticket — gift selection
          </span>
          {recents.length > 0 && (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-paper/60">recent jobs</span>
              {recents.slice(0, 3).map((run) => (
                <button
                  key={run.id}
                  type="button"
                  disabled={busy}
                  onClick={() => loadRecent(run)}
                  title={`${run.interests.join(", ")} · $${run.budgetMax}`}
                  className="border border-paper/40 px-1.5 py-0.5 font-mono text-[10px] text-paper transition hover:bg-paper hover:text-ink disabled:opacity-40"
                >
                  {run.interests[0] ?? "job"}
                  {run.interests.length > 1 && ` +${run.interests.length - 1}`}
                </button>
              ))}
            </span>
          )}
        </header>
        <div className="grid gap-8 p-5 sm:p-7 lg:grid-cols-[1.35fr_1fr]">
          <div className="space-y-7">
            <div>
              <label htmlFor="interest-input" className="mb-2 block text-sm font-semibold text-ink">
                What do they love?
              </label>
              <div className="flex flex-wrap gap-2 border border-fog bg-paper p-3">
                {interests.map((interest) => (
                  <span key={interest} className="inline-flex items-center gap-1.5 bg-ink px-3 py-1.5 text-sm text-paper">
                    {interest}
                    <button
                      type="button"
                      aria-label={`Remove ${interest}`}
                      className="text-paper/60 hover:text-butter"
                      onClick={() => removeInterest(interest)}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  id="interest-input"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === ",") {
                      event.preventDefault();
                      addInterest(draft);
                    }
                  }}
                  onBlur={() => addInterest(draft)}
                  placeholder={interests.length === 0 ? "an artist, film, book, show or brand…" : "add another…"}
                  className="min-w-[12rem] flex-1 bg-transparent px-1 py-1.5 text-sm text-ink outline-none placeholder:text-muted/70"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {SUGGESTIONS.filter((suggestion) => !interests.some((entry) => entry.toLowerCase() === suggestion.toLowerCase()))
                  .slice(0, 6)
                  .map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      disabled={busy}
                      onClick={() => addInterest(suggestion)}
                      className="border border-fog bg-white px-2.5 py-1 font-mono text-xs text-muted transition hover:border-cobalt hover:text-cobalt disabled:opacity-40"
                    >
                      + {suggestion}
                    </button>
                  ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted">try a whole person</span>
                {PERSONAS.map((persona) => (
                  <button
                    key={persona.id}
                    type="button"
                    disabled={busy}
                    onClick={() => loadRecent(persona)}
                    className="border border-ink bg-butter px-2.5 py-1 text-xs font-semibold text-ink transition hover:border-cobalt hover:bg-white disabled:opacity-40"
                  >
                    {persona.recipientName} · {persona.occasion.toLowerCase()} · ${persona.budgetMax}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="recipient-name" className="mb-2 block text-sm font-semibold text-ink">
                  Their name (optional)
                </label>
                <input
                  id="recipient-name"
                  value={recipientName}
                  disabled={busy}
                  onChange={(event) => setRecipientName(event.target.value)}
                  placeholder="Maya"
                  className="w-full border border-fog bg-paper px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-cobalt disabled:opacity-60"
                />
              </div>
              <div role="group" aria-label="Occasion">
                <span className="mb-2 block text-sm font-semibold text-ink">Occasion</span>
                <div className="flex flex-wrap gap-2">
                  {OCCASIONS.map((entry) => (
                    <button
                      key={entry}
                      type="button"
                      aria-pressed={occasion === entry}
                      disabled={busy}
                      onClick={() => setOccasion((current) => (current === entry ? "" : entry))}
                      className={`border px-2.5 py-1.5 font-mono text-xs transition disabled:opacity-40 ${
                        occasion === entry
                          ? "border-ink bg-ink text-paper"
                          : "border-fog bg-paper text-muted hover:border-cobalt hover:text-cobalt"
                      }`}
                    >
                      {entry}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6 lg:border-l-2 lg:border-dashed lg:border-fog lg:pl-8">
            <div>
              <label htmlFor="budget-range" className="mb-2 block text-sm font-semibold text-ink">
                Budget per gift
              </label>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-xs text-muted">$10</span>
                <span className="font-mono text-xl font-semibold text-ink">${budgetMax}</span>
                <span className="font-mono text-xs text-muted">$300</span>
              </div>
              <input
                id="budget-range"
                type="range"
                min={10}
                max={300}
                step={5}
                value={budgetMax}
                disabled={busy}
                onChange={(event) => setBudgetMax(Number(event.target.value))}
                className="mt-3 w-full accent-cobalt"
              />
            </div>
            <button
              type="button"
              onClick={() => startRecommend({})}
              disabled={interests.length === 0 || busy}
              className="w-full bg-cobalt px-5 py-4 font-semibold text-white transition hover:bg-cobalt-deep disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === "loading" ? "Reading their taste…" : "Find their gifts"}
            </button>
            {interests.length === 0 && (
              <p className="text-xs leading-relaxed text-muted">Add at least one interest to enable the button.</p>
            )}
            <p className="font-mono text-[10px] leading-relaxed tracking-wider text-muted">
              Grounded in Qloo&apos;s taste graph — 250M+ musicians, films, books, brands and places.
            </p>
          </div>
        </div>
      </section>

      {busy && (
        <section className="border-2 border-ink bg-white" aria-live="polite">
          <header className="flex items-center justify-between border-b-2 border-ink bg-butter px-5 py-3">
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-ink">
              Job in progress — agent transcript
            </span>
            <span className="blink font-mono text-xs text-ink">▮</span>
          </header>
          <ol ref={transcriptRef} className="max-h-72 space-y-1.5 overflow-y-auto p-5 font-mono text-sm">
            {transcriptLines.map((entry, index) => {
              const isStage = entry.event.type === "stage";
              const isLatestStage = isStage && index === lastStageIndex;
              const done = index < lastStageIndex && isStage;
              return (
                <li
                  key={`${index}-${entry.line}`}
                  className={`leading-relaxed ${isLatestStage ? "text-ink" : done ? "text-muted" : isStage ? "text-ink" : "text-muted"}`}
                >
                  {isStage ? (done ? "✓ " : "▸ ") : "\u00A0\u00A0\u00A0"} {entry.line}
                  {isLatestStage && <span className="blink"> ▮</span>}
                </li>
              );
            })}
            {transcriptLines.length === 0 && <li className="text-muted">waking up the agent…</li>}
          </ol>
        </section>
      )}

      {status === "error" && error && (
        <section role="alert" className="border-2 border-stamp bg-white">
          <header className="border-b-2 border-stamp bg-stamp px-5 py-3">
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-white">
              Void — could not complete
            </span>
          </header>
          <div className="space-y-2 p-5">
            <p className="font-semibold text-ink">{error}</p>
            <p className="text-sm text-muted">
              Try a more specific artist, film, book, brand or show — or widen the budget.
            </p>
            <button
              type="button"
              onClick={() => startRecommend({})}
              className="font-mono text-xs font-semibold uppercase tracking-wider text-stamp underline decoration-stamp/40 underline-offset-4 hover:text-ink"
            >
              Try again
            </button>
          </div>
        </section>
      )}

      {status === "done" && result && (
        <div ref={resultsRef} className="space-y-10">
          <section className="border-2 border-ink bg-white">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink bg-ink px-5 py-3">
              <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-paper">
                Taste receipt
              </span>
              <div className="flex flex-wrap items-center gap-3">
                {share && (
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(share)}
                    title="Copy a link that reconstructs this job"
                    className="border border-paper/40 px-2 py-0.5 font-mono text-xs text-paper transition hover:bg-paper hover:text-ink"
                  >
                    copy link
                  </button>
                )}
                <span className="font-mono text-xs text-paper/70">budget ${appliedBudget}</span>
              </div>
            </header>

            <div className="space-y-6 p-5">
              <div className="flex flex-wrap gap-2">
                {result.resolvedInterests.map((entry) => {
                  const weight = weightOf(entry.input);
                  return (
                    <div key={entry.input} className="flex flex-wrap items-center gap-2 border border-ink/20 bg-paper px-3 py-1.5 text-sm">
                      <span className="font-semibold text-ink">{entry.input}</span>
                      {entry.matchedName.toLowerCase() !== entry.input.toLowerCase() && (
                        <>
                          <span className="text-muted">→</span>
                          <span className="text-ink">{entry.matchedName}</span>
                        </>
                      )}
                      <span className="border border-ink/20 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">
                        {entry.type}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => cycleWeight(entry.input)}
                        title={WEIGHT_TITLE[weight]}
                        aria-pressed={weight !== "neutral"}
                        className={`font-mono text-xs transition disabled:opacity-40 ${
                          weight === "boosted"
                            ? "text-cobalt"
                            : weight === "muted"
                              ? "text-stamp"
                              : "text-muted hover:text-cobalt"
                        }`}
                      >
                        {WEIGHT_MARK[weight]}
                      </button>
                      {entry.alternates.map((alternate) => (
                        <button
                          key={alternate.type}
                          type="button"
                          title={`Re-run with "${entry.input}" matched as ${alternate.type}`}
                          onClick={() => startRecommend({ [entry.input]: alternate.type })}
                          className="font-mono text-[10px] uppercase tracking-wider text-pink-deep underline decoration-dotted underline-offset-2 hover:text-pink"
                        >
                          also {alternate.type}?
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>

              {refineLog.length > 0 && (
                <ul className="space-y-1 border border-dashed border-fog bg-paper px-3 py-2">
                  {refineLog.map((note, index) => (
                    <li key={`${index}-${note}`} className="font-mono text-xs text-muted">
                      ☞ {note}
                    </li>
                  ))}
                </ul>
              )}

              {tasteByType.size > 0 && (
                <div>
                  <p className="text-sm text-muted">
                    Adjacent taste discovered across the graph — 1 hop from direct signals, 2 hops via the first wave
                  </p>
                  <div className="mt-3 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from(tasteByType.entries()).map(([type, entries]) => (
                      <div key={type} className="border border-fog bg-paper p-3">
                        <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                          {type}
                        </p>
                        <ul className="space-y-2">
                          {entries.map((entry, index) => (
                            <li key={`${entry.entityName}-${index}`} className="border-b border-dashed border-fog pb-1.5 last:border-none last:pb-0">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="min-w-0 truncate text-sm font-medium text-ink" title={entry.entityName}>
                                  {entry.entityName}
                                </span>
                                <Meter value={entry.affinityPct} />
                              </div>
                              {(entry.hops === 2 || entry.via) && (
                                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-pink-deep">
                                  {entry.hops === 2 ? "2 hops" : ""}
                                  {entry.via ? `${entry.hops === 2 ? " · " : ""}via ${entry.via}` : ""}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.connections.length > 0 && (
                <div>
                  <p className="text-sm text-muted">Six degrees of their taste</p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {result.connections.map((connection, index) => (
                      <li
                        key={`${connection.from}-${connection.to}-${index}`}
                        className="border border-ink/20 bg-white px-2.5 py-1.5 font-mono text-xs text-muted"
                      >
                        <span className="text-ink">{connection.from}</span> → <span className="text-ink">{connection.to}</span>
                        <span className="text-pink-deep"> at {connection.affinityPct}%</span>
                        {connection.via && <> · through {connection.via}</>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.warnings.length > 0 && (
                <ul className="space-y-1">
                  {result.warnings.map((warning) => (
                    <li key={warning} className="font-mono text-xs leading-relaxed text-muted">
                      note — {warning}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="grid items-start gap-7 pt-1 lg:grid-cols-3">
            {result.picks.map((pick) => (
              <LaneCard key={pick.lane} pick={pick} onRefine={(action) => void refine(action)} busy={busy} />
            ))}
          </section>

          <section className="border-2 border-ink bg-white">
            <header className="border-b-2 border-ink bg-ink px-5 py-3">
              <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-paper">
                Tune the agent
              </span>
            </header>
            <div className="grid gap-5 p-5 md:grid-cols-2">
              <div className="space-y-2">
                <p className="font-mono text-xs uppercase tracking-wider text-muted">direction</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void refine({ kind: "mood", mood: "adventurous" })}
                    aria-pressed={constraints.mood === "adventurous"}
                    className={`border px-2.5 py-1.5 font-mono text-xs transition disabled:opacity-40 ${
                      constraints.mood === "adventurous"
                        ? "border-pink bg-pink text-white"
                        : "border-fog text-muted hover:border-pink hover:text-pink-deep"
                    }`}
                  >
                    bolder
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void refine({ kind: "mood", mood: "grounded" })}
                    aria-pressed={constraints.mood === "grounded"}
                    className={`border px-2.5 py-1.5 font-mono text-xs transition disabled:opacity-40 ${
                      constraints.mood === "grounded"
                        ? "border-cobalt bg-cobalt text-white"
                        : "border-fog text-muted hover:border-cobalt hover:text-cobalt"
                    }`}
                  >
                    more grounded
                  </button>
                  {constraints.mood && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void refine({ kind: "mood", mood: "clear" })}
                      className="border border-fog px-2.5 py-1.5 font-mono text-xs text-muted transition hover:border-ink hover:text-ink disabled:opacity-40"
                    >
                      clear
                    </button>
                  )}
                  {(constraints.priorItemIds.length > 0 || constraints.avoidItemIds.length > 0) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void refine({ kind: "reset-picks" })}
                      className="border border-fog px-2.5 py-1.5 font-mono text-xs text-muted transition hover:border-ink hover:text-ink disabled:opacity-40"
                      title={`Bring back ${constraints.priorItemIds.length} shown and ${constraints.avoidItemIds.length} avoided picks`}
                    >
                      reset rotation ({constraints.avoidItemIds.length + constraints.priorItemIds.length} parked)
                    </button>
                  )}
                  {budgetMax !== appliedBudget && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void refine({ kind: "budget", newMin: 0, newMax: budgetMax })}
                      className="border border-butter bg-butter px-2.5 py-1.5 font-mono text-xs font-semibold text-ink transition hover:border-ink disabled:opacity-40"
                    >
                      re-run at ${budgetMax}
                    </button>
                  )}
                </div>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!setNoteNoteNotice() || busy) return;
                  const text = noteDraft.trim();
                  setNoteDraft("");
                  void refine({ kind: "note", text });
                }}
                className="space-y-2"
              >
                <label htmlFor="agent-note" className="font-mono text-xs uppercase tracking-wider text-muted">
                  tell the agent anything
                </label>
                <div className="flex gap-2">
                  <input
                    id="agent-note"
                    value={noteDraft}
                    disabled={busy}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    placeholder="under $60 · less Radiohead · bolder please"
                    className="flex-1 border border-fog bg-paper px-3 py-2 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-cobalt disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={busy || noteDraft.trim().length === 0}
                    className="bg-ink px-4 py-2 font-mono text-xs uppercase tracking-wider text-paper transition hover:bg-cobalt disabled:opacity-40"
                  >
                    send
                  </button>
                </div>
                <p className="font-mono text-[10px] leading-relaxed text-muted">
                  It re-parses budgets, boosts/mutes interests, and retries the whole loop — the transcript shows what it heard.
                </p>
              </form>
            </div>
          </section>
        </div>
      )}

      <footer className="mt-auto flex flex-col gap-2 border-t-2 border-ink pt-5 font-mono text-[11px] leading-relaxed text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>TASTEPRINT — built for the Qloo Agentic Hackathon.</p>
        <p>Catalog is a curated demo; product links go to live search.</p>
      </footer>
    </div>
  );
}
