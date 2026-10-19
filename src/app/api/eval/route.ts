import { NextResponse } from "next/server";
import { recommend, warmCatalog } from "@/lib/agent/pipeline";
import { runAgent, agentAvailable } from "@/lib/agent/agent";
import { checkResult } from "@/lib/agent/invariants";
import { EVAL_PROFILES } from "@/lib/agent/eval-profiles";
import { QlooError } from "@/lib/qloo/client";
import type { RecommendResult } from "@/lib/agent/types";

export const maxDuration = 300;

interface ProfileReport {
  id: string;
  label: string;
  ok: boolean;
  mode: string;
  failures: string[];
  durationMs: number;
  picks: { lane: string; titles: string[]; total: number }[];
  surpriseVia?: string;
  error?: string;
}

/**
 * Run every eval profile through the same engine the UI uses, then check the
 * invariants. GET runs the full suite; GET ?only=<id> runs one profile.
 *
 * This is judge-facing: it demonstrates the agent's picks hold up under
 * fixed, adversarial inputs rather than looking good in one demo.
 */
export async function GET(request: Request) {
  warmCatalog();
  const url = new URL(request.url);
  const only = url.searchParams.get("only");
  const live = url.searchParams.get("engine") === "pipeline" ? false : agentAvailable();
  const profiles = only ? EVAL_PROFILES.filter((entry) => entry.id === only) : EVAL_PROFILES;
  if (profiles.length === 0) {
    return NextResponse.json({ success: false, error: `Unknown profile: ${only}` }, { status: 404 });
  }

  const reports: ProfileReport[] = [];
  for (const profile of profiles) {
    const started = Date.now();
    let result: RecommendResult | null = null;
    let mode = "pipeline";
    try {
      if (live) {
        result = await runAgent(profile.request, { constraints: profile.constraints });
        if (result) mode = "agent";
      }
      if (!result) {
        result = await recommend(profile.request, { constraints: profile.constraints });
      }
      const check = checkResult(result, profile.request, profile.constraints);
      reports.push({
        id: profile.id,
        label: profile.label,
        ok: check.ok,
        mode,
        failures: check.failures,
        durationMs: Date.now() - started,
        picks: result.picks.map((pick) => ({
          lane: pick.lane,
          titles: pick.items.map((item) => item.title),
          total: pick.totalPrice,
        })),
        surpriseVia: result.picks.find((pick) => pick.lane === "surprise")?.items[0]?.matchedInterests.join(" · "),
      });
    } catch (error) {
      const message =
        error instanceof QlooError ? error.message : error instanceof Error ? error.message : "unknown error";
      reports.push({
        id: profile.id,
        label: profile.label,
        ok: false,
        mode,
        failures: [],
        durationMs: Date.now() - started,
        picks: [],
        error: message,
      });
    }
  }

  const passed = reports.filter((report) => report.ok).length;
  return NextResponse.json({
    success: passed === reports.length,
    engine: live ? "agent" : "pipeline",
    passed,
    total: reports.length,
    reports,
  });
}
