"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { AgentEvent } from "@/lib/agent/types";
import { LANE_META } from "./LaneCard";
import { Icon } from "./Icon";

function progressLine(event: AgentEvent): string | null {
  switch (event.type) {
    case "thought": return event.content.trim() || null;
    case "stage": return `${event.label}${event.detail ? ` — ${event.detail}` : ""}`;
    case "agent-step": return `${event.summary}${event.reason ? ` · ${event.reason}` : ""}`;
    case "agent-note": case "warning": return event.message;
    case "interest": return `Matched ${event.input} to ${event.matchedName} (${event.entityType}).${event.note ? ` ${event.note}` : ""}`;
    case "expansion": return `Discovered ${event.name}: ${event.affinityPct}% cultural affinity${event.via ? `, through ${event.via}` : ""}.`;
    case "selection": return `${LANE_META[event.lane].label}: ${event.titles.join(" + ")}`;
    default: return null;
  }
}

export function AgentActivity({ events, busy, replay, onCancel }: { events: AgentEvent[]; busy: boolean; replay: boolean; onCancel: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();
  const logRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const lines = events.flatMap((event) => { const line = progressLine(event); return line ? [{ line, type: event.type }] : []; });
  const stages = events.filter((event) => event.type === "stage");
  const stage = stages.at(-1)?.stage;
  const currentStep = stage === "done" ? 3 : ["select", "score", "explain"].includes(stage ?? "") ? 2 : ["expand", "hop2"].includes(stage ?? "") ? 1 : 0;

  useEffect(() => {
    if (!busy || !expanded || !followRef.current || !logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines.length, expanded, busy]);

  return <section className="agent-activity" aria-label="Gift agent activity">
    <header><button type="button" className="activity-toggle" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded((value) => !value)}><span className={`activity-symbol ${busy ? "is-busy" : ""}`}><Icon name={busy ? "spark" : "check"} size={17} /></span><span><strong>{busy ? replay ? "Playing the recorded search" : "Finding the thoughtful connections" : "Inside the gift search"}</strong><small>{busy ? stages.at(-1)?.label ?? "Starting the gift agent…" : `${lines.length} progress updates`}</small></span><Icon name="chevron" size={16} className={expanded ? "rotate-180" : ""} /></button>{busy && <button type="button" className="text-button activity-cancel" onClick={onCancel}><Icon name="stop" size={12} />Stop</button>}</header>
    {busy && <div className="activity-steps">{["Read their taste", "Explore connections", "Curate their gifts"].map((label, index) => <span className={index <= currentStep ? "is-current" : ""} key={label}>{index < currentStep ? <Icon name="check" size={12} /> : <i />}{label}</span>)}</div>}
    {expanded && <div id={contentId} ref={logRef} role="log" aria-label="Agent progress updates" className="activity-log" onScroll={() => { const log = logRef.current; if (log) followRef.current = log.scrollHeight - log.scrollTop - log.clientHeight < 45; }}>
      {lines.map((entry, index) => <p key={index} className={`activity-line activity-${entry.type}`}><span aria-hidden="true" />{entry.line}</p>)}
      {!lines.length && <p className="muted">{busy ? "Starting the gift agent…" : "No progress updates were received for this run."}</p>}
      {busy && <p className="activity-waiting"><span className="live-dot" />{replay ? "Recorded events, playing in order…" : "Listening for the next update…"}</p>}
    </div>}
  </section>;
}
