"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { AgentEvent, RecommendResult } from "@/lib/agent/types";
import { buildTasteGraph, graphColor } from "@/lib/taste-graph";
import { ConstellationFallback } from "./ConstellationFallback";
import { Icon } from "./Icon";

const TasteConstellation = dynamic(() => import("./TasteConstellation"), {
  ssr: false,
  loading: () => <div className="constellation"><ConstellationFallback /></div>,
});

export function TasteGraph({ events, result, recipient, live, onFocusEntity }: {
  events: AgentEvent[];
  result: RecommendResult | null;
  recipient: string;
  live: boolean;
  onFocusEntity?: (name: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"3d" | "list">("3d");
  const [unavailable, setUnavailable] = useState(false);
  const data = useMemo(() => buildTasteGraph(events, result, recipient), [events, result, recipient]);
  const active = data.nodes.find((node) => node.id === selectedId);
  const discoveries = data.nodes.filter((node) => node.ring > 0);
  const connection = result?.connections.find((entry) => entry.to.toLowerCase() === active?.label.toLowerCase());
  const gift = result?.picks.flatMap((pick) => pick.items).find((item) => item.entityName.toLowerCase() === active?.label.toLowerCase());

  return <section className="taste-graph" aria-label="Interactive taste graph">
    <header className="graph-header">
      <div><h3>Their taste, connected.</h3><p>{live ? "Watch their world take shape as the agent explores." : `${discoveries.length} discoveries beyond the things they already love.`}</p></div>
      <div className="segmented-control" aria-label="Graph display">
        <button type="button" aria-pressed={view === "3d"} onClick={() => setView("3d")}><Icon name="globe" size={15} />3D map</button>
        <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}><Icon name="menu" size={15} />List view</button>
      </div>
    </header>
    <div className="graph-layout">
      <div className="graph-stage">
        {view === "3d" && !unavailable ? <TasteConstellation data={data} selectedId={selectedId} onSelect={setSelectedId} onUnavailable={() => setUnavailable(true)} /> : <div className="graph-list">
          {unavailable && view === "3d" && <p className="muted">3D is unavailable on this device. All connections are available below.</p>}
          {data.nodes.filter((node) => node.id !== "center").map((node) => <button key={node.id} type="button" className="graph-list-node" aria-pressed={node.id === selectedId} onClick={() => setSelectedId(node.id)}>
            <span className="node-dot" style={{ background: graphColor(node) }} /><span><strong>{node.label}</strong><small>{node.ring === 0 ? "Stated interest" : node.ring === 2 ? "Second-hop discovery" : "First-hop discovery"}{node.via ? `, via ${node.via}` : ""}</small></span>{node.affinityPct !== undefined && <span>{node.affinityPct}%</span>}
          </button>)}
          {data.nodes.length === 1 && <p className="muted">Your interests will appear here as they are matched.</p>}
        </div>}
      </div>
      <aside className="graph-inspector">
        <div className="graph-legend">
          <span><i style={{ background: "#dbc6a0" }} />Stated interests</span>
          <span><i style={{ background: "#aaa0e5" }} />First discoveries</span>
          <span><i style={{ background: "#80b8ac" }} />Second-hop connections</span>
        </div>
        {active && active.id !== "center" ? <div className="node-inspector" aria-live="polite">
          <span className="subtle-label">{active.type} {active.ring > 0 ? ` / ${active.ring === 2 ? "second" : "first"} hop` : " / stated interest"}</span>
          <h4>{active.label}</h4>
          {active.affinityPct !== undefined && <p className="affinity-number">{active.affinityPct}<span>% cultural affinity</span></p>}
          {active.via && <p className="bridge-path"><Icon name="link" size={15} />Connected through {active.via}</p>}
          {connection?.bridgeStory && <p className="inspector-story">{connection.bridgeStory}</p>}
          {gift && <p className="inspector-gift"><Icon name="gift" size={16} />In your selection: {gift.title}</p>}
          {onFocusEntity && active.ring > 0 && <button type="button" className="button button-secondary button-small" disabled={live} onClick={() => onFocusEntity(active.label)}><Icon name="plus" size={15} />Lean into this taste</button>}
        </div> : <div className="inspector-empty"><Icon name="spark" size={28} /><h4>Follow a little curiosity.</h4><p>Select a name to see its place in their taste, then use it to steer the next selection.</p></div>}
        <p className="graph-footnote">Dotted lines show second hops or whole-profile matches. Connections come from Qloo; position and distance are illustrative.</p>
      </aside>
    </div>
  </section>;
}

export type { GraphNode, GraphEdge } from "@/lib/taste-graph";
