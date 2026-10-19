import type { AgentEvent, RecommendResult } from "./agent/types";

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  ring: 0 | 1 | 2;
  affinityPct?: number;
  via?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: "interest" | "affinity" | "profile";
  hops: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const normalize = (value: string) => value.toLowerCase().trim();
const shortType = (value: string) => value.replace("urn:entity:", "").replaceAll("_", " ");

export function buildTasteGraph(events: AgentEvent[], result: RecommendResult | null, recipient: string): GraphData {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  nodes.set("center", { id: "center", label: recipient.trim() || "Their taste", type: "recipient", ring: 0 });
  const addNode = (label: string, type: string, ring: 0 | 1 | 2, affinityPct?: number, via?: string) => {
    const id = normalize(label);
    const current = nodes.get(id);
    nodes.set(id, {
      id, label, type: shortType(type || current?.type || "discovery"),
      ring: current?.ring === 0 ? 0 : ring,
      affinityPct: affinityPct ?? current?.affinityPct,
      via: via ?? current?.via,
    });
    return id;
  };
  const addEdge = (from: string, to: string, kind: GraphEdge["kind"], hops = 1) => {
    if (from === to || !nodes.has(from) || !nodes.has(to)) return;
    edges.set(`${from}|${to}`, { from, to, kind, hops });
  };

  for (const entry of result?.resolvedInterests ?? []) addNode(entry.matchedName, entry.type, 0);
  for (const event of events) {
    if (event.type === "interest") addNode(event.matchedName, event.entityType, 0);
    if (event.type === "expansion") addNode(event.name, event.entityType, event.hops === 2 ? 2 : 1, event.affinityPct, event.via);
  }
  for (const entry of result?.tasteMap ?? []) {
    addNode(entry.entityName, entry.type, entry.hops === 2 ? 2 : 1, entry.affinityPct, entry.via);
  }
  // A connection may contain a bridge omitted from the compact taste map.
  for (const connection of result?.connections ?? []) {
    for (const label of [connection.from, connection.via, connection.to]) {
      if (label && !nodes.has(normalize(label))) addNode(label, "discovery", label === connection.to && connection.hops === 2 ? 2 : 1);
    }
    const from = normalize(connection.from);
    const to = normalize(connection.to);
    const via = connection.via ? normalize(connection.via) : null;
    if (via && via !== from && via !== to) {
      addEdge(from, via, "affinity");
      addEdge(via, to, "affinity", connection.hops);
    } else addEdge(from, to, "affinity", connection.hops);
  }
  for (const node of nodes.values()) {
    if (node.id === "center") continue;
    if (node.ring === 0) addEdge("center", node.id, "interest", 0);
    else if (node.via && nodes.has(normalize(node.via))) addEdge(normalize(node.via), node.id, "affinity", node.ring);
  }
  const connected = new Set([...edges.values()].flatMap((edge) => [edge.from, edge.to]));
  for (const node of nodes.values()) {
    // An aggregate match belongs to the whole profile; never invent a seed attribution.
    if (!connected.has(node.id) && node.id !== "center") addEdge("center", node.id, "profile", node.ring);
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

export function graphColor(node: GraphNode): string {
  return node.id === "center" ? "#f2f0e9" : node.ring === 0 ? "#dbc6a0" : node.ring === 1 ? "#aaa0e5" : "#80b8ac";
}

/** An illustrative constellation for the landing page, without asserted affinities. */
export const HERO_GRAPH: GraphData = {
  nodes: [
    { id: "center", label: "Their world", type: "recipient", ring: 0 },
    { id: "radiohead", label: "Radiohead", type: "artist", ring: 0 },
    { id: "ghibli", label: "Studio Ghibli", type: "film", ring: 0 },
    { id: "muji", label: "MUJI", type: "design", ring: 0 },
    { id: "sakamoto", label: "Ryuichi Sakamoto", type: "artist", ring: 1 },
    { id: "cinema", label: "Japanese cinema", type: "film", ring: 1 },
    { id: "design", label: "Objects with a story", type: "design", ring: 2 },
    { id: "books", label: "Art & photography", type: "book", ring: 2 },
  ],
  edges: [
    { from: "center", to: "radiohead", kind: "interest", hops: 0 },
    { from: "center", to: "ghibli", kind: "interest", hops: 0 },
    { from: "center", to: "muji", kind: "interest", hops: 0 },
    { from: "radiohead", to: "sakamoto", kind: "affinity", hops: 1 },
    { from: "ghibli", to: "cinema", kind: "affinity", hops: 1 },
    { from: "muji", to: "design", kind: "affinity", hops: 2 },
    { from: "cinema", to: "books", kind: "affinity", hops: 2 },
  ],
};
