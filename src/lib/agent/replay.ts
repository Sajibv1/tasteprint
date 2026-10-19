import demoScenarios from "@/data/demo-scenarios.json";
import type { AgentEvent, ProgressSink, RecommendRequest, RecommendResult, SessionConstraints } from "./types";

/**
 * Demo replay.
 *
 * A recorded run — the exact events and result of a known-good scenario — can
 * stand in for a live Qloo run when the network, the API quota, or a live
 * demo stage is having a bad day. Enable with TASTEPRINT_REPLAY=1.
 *
 * Seeded recordings live in `src/data/demo-scenarios.json` and are produced by
 * `npm run demo:record` against a working Qloo key.
 */

export interface DemoScenario {
  id: string;
  label: string;
  request: {
    recipientName?: string;
    interests: string[];
    occasion?: string;
    budgetMax?: number;
  };
  events: AgentEvent[];
  result: RecommendResult;
}

export function replayEnabled(): boolean {
  return process.env.TASTEPRINT_REPLAY === "1";
}

function interestKey(values: (string | { name: string })[] | undefined): string {
  const names = (values ?? []).map((entry) => (typeof entry === "string" ? entry : entry.name).toLowerCase().trim());
  return [...new Set(names)].sort().join("|");
}

/** Pick the recorded scenario that best matches this request, if any. */
export function matchScenario(
  scenarios: DemoScenario[],
  request: RecommendRequest,
): DemoScenario | undefined {
  const wanted = interestKey(request.interests);
  if (wanted.length === 0) return undefined;
  const exact = scenarios.filter((scenario) => interestKey(scenario.request.interests) === wanted);
  if (exact.length === 0) return undefined;
  const budget = request.budget?.max;
  return (
    exact.find((scenario) => budget !== undefined && scenario.request.budgetMax === budget) ??
    exact[0]
  );
}

let loaded: DemoScenario[] | null = null;

function loadScenarios(): DemoScenario[] {
  if (loaded) return loaded;
  loaded = Array.isArray(demoScenarios) ? (demoScenarios as DemoScenario[]) : [];
  return loaded;
}

/**
 * Replay a recorded run when enabled. Returns the recorded result, or null so
 * the caller continues with a live run.
 */
export function replayScenario(
  request: RecommendRequest,
  options: { sink?: ProgressSink; constraints?: Partial<SessionConstraints>; force?: boolean } = {},
): RecommendResult | null {
  if (!replayEnabled() && !options.force) return null;
  const scenario = matchScenario(loadScenarios(), request);
  if (!scenario) return null;
  const sink = options.sink;
  sink?.({ type: "stage", stage: "start", label: "Replaying a recorded run", detail: scenario.label });
  sink?.({
    type: "thought",
    content: `Replay engine engaged for ${scenario.request.recipientName || "recipient"}: evaluating stated taste anchors [${scenario.request.interests.join(", ")}]. Synthesizing aesthetic bridge across literary melancholy, experimental soundscapes, and visual worldbuilding.`,
  });
  for (const event of scenario.events) {
    if (event.type === "result" || event.type === "error") continue;
    sink?.(event);
  }

  // Ensure dossier and bridge stories exist on result
  const dossier = scenario.result.dossier ?? {
    title: `${scenario.request.recipientName || "Recipient"}'s Aesthetic Archetype: Atmospheric Narrative Explorer`,
    narrative: `Connects ${scenario.request.interests.join(", ")} through shared emotional resonance, introspective worldbuilding, and artisanal design aesthetics.`,
    keywords: ["Atmospheric", "Introspective", "Artisanal", "Worldbuilding"],
  };

  sink?.({ type: "dossier", dossier });

  sink?.({
    type: "agent-note",
    message: "replay mode — this run is a golden recording for zero-latency presentation",
  });

  const enrichedResult: RecommendResult = {
    ...scenario.result,
    dossier,
    connections: scenario.result.connections.map((c) => ({
      ...c,
      bridgeStory:
        c.bridgeStory ??
        `Shared cultural DNA: both ${c.from} and ${c.to}${c.via ? ` (via ${c.via})` : ""} share an appreciation for meticulous craft and textured atmosphere.`,
    })),
  };

  return enrichedResult;
}
