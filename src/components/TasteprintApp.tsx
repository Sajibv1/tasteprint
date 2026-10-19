"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import type { AgentEvent, ClarificationOption, RecommendRequest, RecommendResult, RefineAction, SessionConstraints, TasteDossier } from "@/lib/agent/types";
import { emptyConstraints } from "@/lib/agent/types";
import { readAgentEvents, replayDelay } from "@/lib/agent-stream";
import { DEMO_PROFILES, type DemoProfile } from "@/lib/demo-profiles";
import { AgentActivity } from "./AgentActivity";
import { Collection, type CollectionItem } from "./Collection";
import { GiftShelf } from "./GiftShelf";
import { Hero } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { Fingerprint, Icon } from "./Icon";
import { LaneCard } from "./LaneCard";
import { SavedGiftsProvider, useSavedGifts } from "./SavedGifts";
import { TasteGraph } from "./TasteGraph";
import { VoiceNoteInput } from "./VoiceNoteInput";

const SUGGESTIONS = ["Radiohead", "Studio Ghibli", "Björk", "MUJI", "Sally Rooney", "Dune", "Frank Ocean", "In the Mood for Love"];
const OCCASIONS = ["Birthday", "Anniversary", "Holidays", "Housewarming", "Just because"];
const RECENTS_KEY = "tasteprint.runs.v1";

interface InterestOverride { name?: string; type?: string }
interface EntityMatch { id: string; name: string; type: string; popularity: number }
interface RecentRun { id: string; ts: number; recipientName: string; occasion: string; interests: string[]; budgetMax: number }
interface RunAttempt { request: RecommendRequest; constraints?: SessionConstraints; action?: RefineAction; replay?: boolean }
interface AppProps { collection: CollectionItem[]; categoryCounts: Record<string, number>; catalogCount: number }
type Status = "idle" | "loading" | "refining" | "done" | "error" | "cancelled";

function shortType(value: string) { return value.replace(/^urn:entity:/, "").replaceAll("_", " "); }
function interestNames(request: RecommendRequest) { return request.interests.map((entry) => typeof entry === "string" ? entry : entry.name); }
function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
}

function encodeProfile(request: RecommendRequest, budget: number): string {
  const payload = { n: request.recipientName ?? "", o: request.occasion ?? "", b: budget, interests: request.interests, categories: request.categories };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function decodeProfile(value: string): Record<string, unknown> | null {
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0))));
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

function validRecent(value: unknown): value is RecentRun {
  if (!value || typeof value !== "object") return false;
  const run = value as Partial<RecentRun>;
  return typeof run.id === "string" && typeof run.recipientName === "string" && typeof run.occasion === "string" && Array.isArray(run.interests) && run.interests.every((entry) => typeof entry === "string") && typeof run.budgetMax === "number" && Number.isFinite(run.budgetMax);
}

function Navigation() {
  const { gifts, open } = useSavedGifts();
  return <header className="site-header"><div className="nav-inner"><a className="brand" href="#" aria-label="Tasteprint home"><Fingerprint size={33} /><span>tasteprint<span className="brand-period">.</span></span></a><nav aria-label="Main navigation"><a href="#discover">Discover</a><a href="#collection">The collection</a><a href="#how-it-works">How it works</a></nav><button type="button" className="saved-button" onClick={open}><Icon name="heart" size={17} /><span>Saved</span><span className="saved-count">{gifts.length}</span></button></div></header>;
}

function Dossier({ dossier }: { dossier: TasteDossier }) {
  return <section className="taste-dossier"><div className="dossier-icon"><Fingerprint size={40} /></div><div><span className="subtle-label">Their cultural fingerprint</span><h3>{dossier.title}</h3><p>{dossier.narrative}</p>{dossier.keywords.length > 0 && <div className="dossier-keywords">{dossier.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>}</div></section>;
}

function Clarification({ question, options, busy, onSelect }: { question: string; options: ClarificationOption[]; busy: boolean; onSelect: (option: ClarificationOption) => void }) {
  return <section className="clarification"><div><Icon name="info" size={20} /><h3>{question}</h3></div>{busy && <p>Choose a direction once this selection is ready.</p>}<div className="clarification-options">{options.map((option) => <button className="button button-secondary button-small" type="button" key={option.value} disabled={busy} onClick={() => onSelect(option)}>{option.label}{option.detail && <small>{option.detail}</small>}</button>)}</div></section>;
}

function Experience({ collection, categoryCounts, catalogCount }: AppProps) {
  const [interests, setInterests] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [occasion, setOccasion] = useState("");
  const [budgetMax, setBudgetMax] = useState(100);
  const [overrides, setOverrides] = useState<Record<string, InterestOverride>>({});
  const [categories, setCategories] = useState<string[]>([]);
  const [constraints, setConstraints] = useState<SessionConstraints>(emptyConstraints);
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState<AgentEvent[]>([]);
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestInView, setRequestInView] = useState<RecommendRequest | null>(null);
  const [replay, setReplay] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [recents, setRecents] = useState<RecentRun[]>([]);
  const [share, setShare] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [entityMatches, setEntityMatches] = useState<EntityMatch[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerIndex, setPickerIndex] = useState(-1);
  const [clarification, setClarification] = useState<{ question: string; options: ClarificationOption[]; key: string } | null>(null);
  const [dossier, setDossier] = useState<TasteDossier | null>(null);
  const [runNumber, setRunNumber] = useState(0);
  const [isRefinement, setIsRefinement] = useState(false);
  const activeRun = useRef<AbortController | null>(null);
  const lastAttempt = useRef<RunAttempt | null>(null);
  const busy = status === "loading" || status === "refining";
  const pickerVisible = pickerOpen && !busy && draft.trim().length >= 2;
  const allCategories = Object.keys(categoryCounts).sort();

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved: unknown = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
        if (Array.isArray(saved)) setRecents(saved.filter(validRecent).slice(0, 8));
      } catch { /* Browser storage is optional. */ }
      const encoded = new URLSearchParams(window.location.search).get("q");
      const decoded = encoded ? decodeProfile(encoded) : null;
      if (!decoded) return;
      const raw = decoded.interests ?? decoded.i;
      if (Array.isArray(raw)) {
        const names: string[] = [];
        const nextOverrides: Record<string, InterestOverride> = {};
        for (const entry of raw.slice(0, 8)) {
          if (typeof entry === "string" && entry.trim()) names.push(entry.slice(0, 100));
          else if (entry && typeof entry === "object" && typeof entry.name === "string") {
            const name = entry.name.slice(0, 100);
            names.push(name);
            if (typeof entry.type === "string") nextOverrides[name] = { type: entry.type };
          }
        }
        setInterests([...new Set(names)]);
        setOverrides(nextOverrides);
      }
      if (typeof decoded.n === "string") setRecipientName(decoded.n.slice(0, 80));
      if (typeof decoded.o === "string" && OCCASIONS.includes(decoded.o)) setOccasion(decoded.o);
      if (typeof decoded.b === "number" && Number.isFinite(decoded.b)) setBudgetMax(Math.min(300, Math.max(10, decoded.b)));
      if (Array.isArray(decoded.categories)) setCategories(decoded.categories.filter((entry): entry is string => typeof entry === "string" && entry in categoryCounts));
    });
    return () => { activeRun.current?.abort(); };
  }, [categoryCounts]);

  useEffect(() => {
    if (!recents.length) return;
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(recents)); } catch { /* Keep in-session recents. */ }
  }, [recents]);

  useEffect(() => {
    const clean = draft.trim().replace(/\s+/g, " ");
    if (clean.length < 2 || busy) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(clean)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Search unavailable");
        const payload = await response.json() as { results?: EntityMatch[] };
        if (controller.signal.aborted) return;
        setEntityMatches(Array.isArray(payload.results) ? payload.results : []);
        setPickerOpen(document.activeElement?.id === "interest-input");
      } catch { /* Free text remains available when suggestions are offline. */ }
      finally { if (!controller.signal.aborted) setPickerLoading(false); }
    }, 300);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [draft, busy]);

  function addInterest(value: string, type?: string) {
    const clean = value.trim().replace(/\s+/g, " ").slice(0, 100);
    if (!clean || interests.length >= 8) return;
    setInterests((current) => current.some((entry) => entry.toLowerCase() === clean.toLowerCase()) ? current : [...current, clean]);
    if (type) setOverrides((current) => ({ ...current, [clean]: { type } }));
    setDraft(""); setPickerOpen(false); setEntityMatches([]); setPickerLoading(false); setPickerIndex(-1);
  }

  function buildRequest(nextOverrides = overrides): RecommendRequest {
    const names = [...interests];
    const clean = draft.trim().replace(/\s+/g, " ").slice(0, 100);
    if (clean && names.length < 8 && !names.some((entry) => entry.toLowerCase() === clean.toLowerCase())) names.push(clean);
    return {
      recipientName: recipientName.trim() || undefined,
      interests: names.map((name) => nextOverrides[name] ? { name: nextOverrides[name].name ?? name, type: nextOverrides[name].type } : name),
      occasion: occasion || undefined,
      budget: { min: 0, max: budgetMax },
      categories: categories.length ? categories : undefined,
    };
  }

  function remember(request: RecommendRequest, effectiveBudget: number) {
    const url = `${window.location.origin}${window.location.pathname}?q=${encodeProfile(request, effectiveBudget)}`;
    setShare(url); setCopied(false); setCopyFailed(false);
    try { window.history.replaceState(null, "", url); } catch { /* Still offer the copyable URL. */ }
    const entry: RecentRun = { id: `r${Date.now()}`, ts: Date.now(), recipientName: request.recipientName ?? "", occasion: request.occasion ?? "", interests: interestNames(request), budgetMax: effectiveBudget };
    setRecents((current) => [entry, ...current.filter((run) => `${run.recipientName}|${run.interests.join("|")}` !== `${entry.recipientName}|${entry.interests.join("|")}`)].slice(0, 8));
  }

  async function run(attempt: RunAttempt) {
    if (activeRun.current || !attempt.request.interests.length) return;
    const controller = new AbortController();
    activeRun.current = controller;
    lastAttempt.current = attempt;
    setStatus(attempt.action ? "refining" : "loading");
    setTranscript([]); setError(null); setClarification(null); setCopied(false);
    setRunNumber((value) => value + 1);
    setIsRefinement(Boolean(attempt.action));
    setReplay(Boolean(attempt.replay));
    setRequestInView(attempt.request);
    if (!attempt.action) { setResult(null); setDossier(null); setConstraints(emptyConstraints()); }
    if (attempt.action && result?.mode === "replay") setTranscript([{ type: "agent-note", message: "Starting a live search from this recorded taste profile." }]);
    requestAnimationFrame(() => scrollTo("results"));
    try {
      const response = await fetch("/api/stream", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ kind: attempt.action ? "refine" : "recommend", request: attempt.request, constraints: attempt.constraints, action: attempt.action, replay: attempt.replay ?? false }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "The gift search could not start. Please try again.");
      }
      let finished = false;
      const paceRecording = attempt.replay && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      for await (const event of readAgentEvents(response)) {
        if (controller.signal.aborted) break;
        if (paceRecording && event.type !== "result") await replayDelay(event.type === "stage" ? 160 : 50, controller.signal);
        setTranscript((current) => [...current, event]);
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "clarification") setClarification({ question: event.question, options: event.options, key: event.key });
        if (event.type === "dossier") setDossier(event.dossier);
        if (event.type === "result") {
          finished = true;
          setResult(event.result);
          if (event.result.dossier) setDossier(event.result.dossier);
          setConstraints({ ...emptyConstraints(), ...event.constraints });
          remember(attempt.request, event.constraints.budgetMax ?? attempt.request.budget?.max ?? 100);
          break;
        }
      }
      if (!finished && !controller.signal.aborted) throw new Error("The gift agent stopped before finishing. Please try again.");
      if (!controller.signal.aborted) setStatus("done");
    } catch (caught) {
      if (controller.signal.aborted) setStatus("cancelled");
      else { setError(caught instanceof Error ? caught.message : "Something went wrong with this search."); setStatus("error"); }
    } finally {
      if (activeRun.current === controller) activeRun.current = null;
    }
  }

  function startRecommend(nextOverrides: Record<string, InterestOverride> = {}) {
    if (busy) return;
    const merged = { ...overrides, ...nextOverrides };
    const request = buildRequest(merged);
    setOverrides(merged);
    if (draft.trim()) addInterest(draft);
    void run({ request, replay: false });
  }

  function refine(action: RefineAction) {
    if (busy || !requestInView) return;
    void run({ request: requestInView, constraints, action, replay: false });
  }

  function loadProfile(profile: Pick<RecentRun, "recipientName" | "interests" | "occasion" | "budgetMax">) {
    if (busy) return;
    setRecipientName(profile.recipientName); setInterests(profile.interests.slice(0, 8));
    setOccasion(profile.occasion); setBudgetMax(Math.max(10, Math.min(300, profile.budgetMax)));
    setOverrides({}); setCategories([]); setDraft(""); setPickerOpen(false);
  }

  function playSample(profile: DemoProfile) {
    if (busy) return;
    loadProfile(profile);
    void run({ request: { recipientName: profile.recipientName, interests: profile.interests, occasion: profile.occasion, budget: { min: 0, max: profile.budgetMax } }, replay: true });
  }

  async function copyProfile() {
    try { await navigator.clipboard.writeText(share); setCopied(true); setCopyFailed(false); }
    catch { setCopyFailed(true); }
  }

  const displayedName = requestInView?.recipientName?.trim() || "them";
  const appliedBudget = constraints.budgetMax ?? requestInView?.budget?.max ?? budgetMax;
  const showResults = Boolean(result);
  const refinementNotes = transcript.flatMap((event) => event.type === "agent-note" && isRefinement ? [event.message] : []);

  return <><a className="skip-link" href="#discover">Skip to gift finder</a><Navigation /><main className="site-main">
    <Hero />
    <section id="discover" className="discover-section" aria-labelledby="discover-heading">
      <header className="section-heading"><div><span className="subtle-label">Let&apos;s find their thing</span><h2 id="discover-heading">What makes them, them?</h2><p>Start with a few favourites. We&apos;ll find the thoughtful connections.</p></div><span className="privacy-note"><Icon name="spark" size={17} />No account. Just a little curiosity.</span></header>
      <form className="gift-form" onSubmit={(event) => { event.preventDefault(); startRecommend(); }}>
        <div className="form-main">
          <div className="field-label"><label htmlFor="interest-input">What do they love?</label><span>{interests.length}/8 interests</span></div>
          <p className="field-hint" id="interest-help">Artists, films, books, games, brands. The more specific, the more personal.</p>
          <div className="interest-field-wrap">
            <div className={`interest-field ${busy ? "is-disabled" : ""}`}>
              {interests.map((interest) => <span className="interest-chip" key={interest}>{interest}<button type="button" disabled={busy} aria-label={`Remove ${interest}`} onClick={() => { setInterests((current) => current.filter((entry) => entry !== interest)); setOverrides((current) => { const next = { ...current }; delete next[interest]; return next; }); }}><Icon name="close" size={12} /></button></span>)}
              <div className="interest-entry"><Icon name="search" size={18} /><input id="interest-input" role="combobox" aria-autocomplete="list" aria-expanded={pickerVisible} aria-controls="entity-options" aria-activedescendant={pickerVisible && pickerIndex >= 0 ? `entity-option-${pickerIndex}` : undefined} aria-describedby="interest-help" autoComplete="off" maxLength={100} disabled={busy || interests.length >= 8} value={draft} placeholder={interests.length ? "Add another favourite…" : "Try Radiohead, Studio Ghibli, MUJI…"} onChange={(event) => { setDraft(event.target.value); setPickerIndex(-1); setEntityMatches([]); setPickerLoading(event.target.value.trim().length >= 2); setPickerOpen(event.target.value.trim().length >= 2); }} onBlur={() => setPickerOpen(false)} onFocus={() => { if (draft.trim().length >= 2) setPickerOpen(true); }} onKeyDown={(event) => {
                if (event.key === "ArrowDown" && entityMatches.length) { event.preventDefault(); setPickerIndex((value) => Math.min(value + 1, entityMatches.length - 1)); setPickerOpen(true); }
                else if (event.key === "ArrowUp" && entityMatches.length) { event.preventDefault(); setPickerIndex((value) => Math.max(value - 1, 0)); }
                else if (event.key === "Enter" || event.key === ",") { event.preventDefault(); const match = pickerVisible && pickerIndex >= 0 ? entityMatches[pickerIndex] : null; if (match) addInterest(match.name, match.type); else addInterest(draft); }
                else if (event.key === "Escape") setPickerOpen(false);
              }} /><button type="button" className="add-interest" disabled={!draft.trim() || busy || interests.length >= 8} aria-label="Add interest" onClick={() => addInterest(draft)}><Icon name="plus" size={17} /></button></div>
            </div>
            {pickerVisible && <ul className="entity-picker" id="entity-options" role="listbox" aria-label="Matching cultural interests">
              {entityMatches.map((match, index) => <li id={`entity-option-${index}`} key={match.id} role="option" aria-selected={index === pickerIndex}><button type="button" tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => addInterest(match.name, match.type)}><strong>{match.name}</strong><span>{shortType(match.type)}</span></button></li>)}
              {!entityMatches.length && <li className="picker-hint" role="presentation">{pickerLoading ? "Looking for matching interests…" : "Press Enter to add this interest."}</li>}
            </ul>}
          </div>
          <div className="interest-suggestions"><span>A little inspiration</span>{SUGGESTIONS.filter((suggestion) => !interests.some((entry) => entry.toLowerCase() === suggestion.toLowerCase())).slice(0, 5).map((suggestion) => <button type="button" disabled={busy || interests.length >= 8} key={suggestion} onClick={() => addInterest(suggestion)}><Icon name="plus" size={12} />{suggestion}</button>)}</div>
          <div className="form-pair"><div><label htmlFor="recipient-name">Their name <span>(optional)</span></label><input id="recipient-name" disabled={busy} value={recipientName} maxLength={80} onChange={(event) => setRecipientName(event.target.value)} placeholder="Someone special" /></div><div><label htmlFor="occasion">The occasion <span>(optional)</span></label><select id="occasion" value={occasion} disabled={busy} onChange={(event) => setOccasion(event.target.value)}><option value="">Just a thoughtful gesture</option>{OCCASIONS.map((entry) => <option value={entry} key={entry}>{entry}</option>)}</select></div></div>
          <details className="category-details"><summary><Icon name="sliders" size={15} />Gift categories<span>{categories.length ? `${categories.length} selected` : "Open to everything"}</span><Icon name="chevron" size={14} /></summary><div className="category-options" aria-label="Allowed gift categories">{allCategories.map((category) => <button key={category} type="button" disabled={busy} aria-pressed={categories.includes(category)} onClick={() => setCategories((current) => current.includes(category) ? current.filter((entry) => entry !== category) : [...current, category])}>{category}<span>{categoryCounts[category]}</span></button>)}{categories.length > 0 && <button type="button" className="clear-categories" disabled={busy} onClick={() => setCategories([])}>Clear selection</button>}</div></details>
        </div>
        <div className="form-budget"><div className="budget-heading"><label htmlFor="budget-range">A comfortable budget</label><span>USD</span></div><div className="budget-value"><span>Up to</span><output htmlFor="budget-range">${budgetMax}</output></div><input id="budget-range" type="range" min={10} max={300} step={5} value={budgetMax} disabled={busy} style={{ "--range-fill": `${((budgetMax - 10) / 290) * 100}%` } as CSSProperties} onChange={(event) => setBudgetMax(Number(event.target.value))} /><div className="budget-limits"><span>$10</span><span>$300</span></div><div className="budget-presets">{[30, 50, 100, 200].map((amount) => <button type="button" key={amount} aria-pressed={budgetMax === amount} disabled={busy} onClick={() => setBudgetMax(amount)}>${amount}</button>)}</div><p className="budget-note">Each suggestion, including the whole bundle, stays within your budget.</p><button type="submit" className="button button-primary find-gifts" disabled={busy || (!interests.length && !draft.trim())}>{busy ? replay ? "Playing the sample…" : "Making connections…" : "Find their gifts"}<Icon name={busy ? "spark" : "arrow"} size={18} /></button><p className="form-footnote">{!interests.length && !draft.trim() ? "Add one interest to begin. Three is a great start." : "One sure thing. One surprise. One thoughtful bundle."}</p></div>
      </form>
      {recents.length > 0 && <div className="recent-profiles"><span>Pick up a recent profile</span>{recents.slice(0, 3).map((recent) => <button type="button" key={recent.id} disabled={busy} title={recent.interests.join(", ")} onClick={() => loadProfile(recent)}>{recent.recipientName || recent.interests[0]}<Icon name="arrow-up-right" size={12} /></button>)}</div>}
      <section id="samples" className="samples" aria-label="Recorded sample walkthroughs"><div className="samples-intro"><Icon name="play" size={18} /><div><h3>A little inspiration?</h3><p>Step inside a recorded Qloo search.</p></div></div><div className="sample-profiles">{DEMO_PROFILES.map((profile) => <button className="sample-profile" type="button" disabled={busy} key={profile.id} aria-label={`Play ${profile.recipientName}'s recorded sample`} onClick={() => playSample(profile)}><Image src={profile.image} alt="" width={48} height={48} /><span><strong>{profile.recipientName}&apos;s {profile.occasion.toLowerCase()}<span>${profile.budgetMax}</span></strong><small>{profile.interests.join(", ")}</small></span><span className="sample-play"><Icon name="play" size={13} /></span></button>)}</div></section>
    </section>

    {status !== "idle" && <section id="results" className="results-section" aria-label="Gift search results">
      <header className="section-heading"><div><span className="subtle-label">{busy ? replay ? "A recorded walkthrough" : "A thoughtful search is underway" : result ? "Thoughtfully connected, personally chosen" : "Your gift search"}</span><h2>{busy ? `Getting to know ${displayedName}.` : result ? `A little more ${displayedName === "them" ? "“them”" : displayedName}.` : "Let’s find the right connection."}</h2>{result && !busy && <p>Three ways to give well, with a budget of ${appliedBudget}.</p>}</div>{result && !busy && share && <button type="button" className="button button-secondary button-small" onClick={() => void copyProfile()}><Icon name={copied ? "check" : "link"} size={15} />{copied ? "Profile link copied" : "Share taste profile"}</button>}</header>
      {copyFailed && <label className="copy-fallback">Copy this profile link<input readOnly value={share} onFocus={(event) => event.target.select()} /></label>}
      {(replay || result?.mode === "replay") && <div className="demo-banner"><Icon name="play" size={16} /><p><strong>Recorded walkthrough.</strong> These are saved Qloo results. Refining starts a fresh, live search.</p>{!busy && requestInView && <button type="button" className="text-link" onClick={() => void run({ request: requestInView, replay: false })}>Try this profile live<Icon name="arrow" size={14} /></button>}</div>}
      <AgentActivity key={runNumber} events={transcript} busy={busy} replay={replay} onCancel={() => { activeRun.current?.abort(); setStatus("cancelled"); }} />
      {status === "error" && <div className="search-error" role="alert"><Icon name="info" size={22} /><div><h3>The search hit a snag.</h3><p>{error}</p>{result && <p>Your last complete selection is still below.</p>}<div><button type="button" className="button button-secondary button-small" onClick={() => { if (lastAttempt.current) void run(lastAttempt.current); }}><Icon name="refresh" size={14} />Try again</button><a href="#discover" className="text-link">Edit their profile</a></div></div></div>}
      {status === "cancelled" && <div className="cancelled-note" role="status"><p>Search stopped. Your profile is ready whenever you are.</p><button type="button" className="text-link" onClick={() => { if (lastAttempt.current) void run(lastAttempt.current); }}>Try again<Icon name="arrow" size={14} /></button></div>}
      {clarification && <Clarification question={clarification.question} options={clarification.options} busy={busy} onSelect={(option) => { refine({ kind: "clarify", key: clarification.key, value: option.value, label: option.label }); setClarification(null); }} />}
      <TasteGraph events={transcript} result={busy ? null : result} recipient={requestInView?.recipientName ?? ""} live={busy} onFocusEntity={(name) => refine({ kind: "boost", interest: name, op: "boost" })} />
      {busy && !result && <div className="gift-skeletons" aria-hidden="true">{[0, 1, 2].map((index) => <div key={index}><span /><span /><span /></div>)}</div>}
      {showResults && result && <div className={`result-content ${busy ? "is-refining" : ""}`} aria-busy={busy}>
        {dossier && <Dossier dossier={dossier} />}
        <div className="selection-heading"><h3>The personal edit.</h3><span>{result.picks.reduce((sum, pick) => sum + pick.items.length, 0)} gift ideas, three directions</span></div>
        <div className="lanes-grid">{result.picks.map((pick) => <LaneCard pick={pick} key={pick.lane} onRefine={refine} busy={busy} />)}</div>
        <p className="selection-note">Prices are catalog estimates. Affinity describes cultural taste, not a prediction of whether someone will buy. Check editions and availability at the retailer.</p>
        <section className="refinement-panel" aria-labelledby="refine-heading"><div><span className="subtle-label">You know them best</span><h3 id="refine-heading">A little closer?</h3><p>Tell us what to change. The agent will rethink the selection.</p><div className="direction-controls"><button type="button" aria-pressed={constraints.mood === "adventurous"} disabled={busy} onClick={() => refine({ kind: "mood", mood: constraints.mood === "adventurous" ? "clear" : "adventurous" })}><Icon name="spark" size={14} />More unexpected</button><button type="button" aria-pressed={constraints.mood === "grounded"} disabled={busy} onClick={() => refine({ kind: "mood", mood: constraints.mood === "grounded" ? "clear" : "grounded" })}><Icon name="heart" size={14} />Play it safe</button></div></div><div><label htmlFor="refine-note">What would make these more them?</label><VoiceNoteInput value={noteDraft} disabled={busy} onChange={setNoteDraft} onSend={() => { if (!noteDraft.trim() || busy) return; const text = noteDraft.trim(); setNoteDraft(""); refine({ kind: "note", text }); }} /><div className="quick-refinements">{["Keep it under $60", "Less music, more books", "Something a little bolder"].map((prompt) => <button type="button" key={prompt} disabled={busy} onClick={() => refine({ kind: "note", text: prompt })}>{prompt}<Icon name="plus" size={12} /></button>)}</div>{(constraints.priorItemIds.length > 0 || constraints.avoidItemIds.length > 0) && <button type="button" className="text-button restore-picks" disabled={busy} onClick={() => refine({ kind: "reset-picks" })}>Bring skipped gifts back into the search</button>}</div></section>
        {refinementNotes.length > 0 && <details className="refinement-receipt"><summary>What changed in this search<Icon name="chevron" size={14} /></summary><ul>{refinementNotes.map((note, index) => <li key={index}>{note}</li>)}</ul></details>}
        <details className="taste-receipt"><summary><span><Icon name="globe" size={18} />The taste behind the selection</span><span>{result.mode === "agent" ? "Agent-led" : result.mode === "replay" ? "Recorded Qloo run" : "Qloo pipeline"}<Icon name="chevron" size={15} /></span></summary><div><p>Resolved interests. Select a weight to steer a fresh search, or correct an ambiguous match.</p><div className="resolved-interests">{result.resolvedInterests.map((entry) => {
          const lower = entry.input.toLowerCase();
          const weight = constraints.boostInterests.some((name) => name.toLowerCase() === lower) ? "boost" : constraints.muteInterests.some((name) => name.toLowerCase() === lower) ? "mute" : "clear";
          return <div key={entry.input}><strong>{entry.input}</strong>{entry.matchedName.toLowerCase() !== lower && <span>matched as {entry.matchedName}</span>}<small>{entry.type}</small><button type="button" disabled={busy} aria-label={`Adjust weight for ${entry.input}: ${weight === "boost" ? "boosted" : weight === "mute" ? "muted" : "neutral"}`} onClick={() => refine({ kind: "boost", interest: entry.input, op: weight === "clear" ? "boost" : weight === "boost" ? "mute" : "clear" })}>{weight === "boost" ? "Leaning in ↑" : weight === "mute" ? "Dialed down ↓" : "Lean into this +"}</button>{[...entry.alternates, ...entry.candidates].map((alternate) => <button type="button" key={`${alternate.name}-${alternate.type}`} disabled={busy} onClick={() => {
            if (!requestInView) return;
            const request = { ...requestInView, interests: requestInView.interests.map((interest) => (typeof interest === "string" ? interest : interest.name) === entry.input ? { name: alternate.name, type: alternate.urn ?? `urn:entity:${alternate.type.replaceAll(" ", "_")}` } : interest) };
            void run({ request, replay: false });
          }}>Use {alternate.name} ({alternate.type})</button>)}</div>;
        })}</div>{result.warnings.length > 0 && <div className="result-notes"><h4>Notes from this search</h4>{result.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}</div></details>
        <GiftShelf key={`${runNumber}-${result.shelf.length}`} items={result.shelf} busy={busy} onAvoid={(item) => refine({ kind: "avoid", itemIds: [item.id] })} />
      </div>}
    </section>}
    <Collection items={collection} total={catalogCount} categoryCounts={categoryCounts} onChooseCategory={(category) => { if (!busy) setCategories([category]); scrollTo("discover"); }} />
    <HowItWorks />
  </main><footer className="site-footer"><a href="#" className="brand"><Fingerprint size={27} /><span>tasteprint.</span></a><p>A little taste. A lot of thought.</p><div><span>Built with Qloo</span><a href="#how-it-works">Made for thoughtful gifting<Icon name="arrow-up-right" size={13} /></a></div></footer></>;
}

export function TasteprintApp(props: AppProps) {
  return <SavedGiftsProvider><Experience {...props} /></SavedGiftsProvider>;
}
