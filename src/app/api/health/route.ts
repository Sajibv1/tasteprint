import { NextResponse } from "next/server";
import { getInsights, searchEntities } from "@/lib/qloo/client";

export const maxDuration = 30;

export async function GET() {
  try {
    const entities = await searchEntities("Radiohead", { types: ["urn:entity:artist"], take: 1 });
    const signal = entities[0]?.entity_id;
    const insights = signal
      ? await getInsights({ filterType: "urn:entity:artist", signalEntities: [signal], take: 3 })
      : null;
    return NextResponse.json({
      ok: true,
      baseUrl: process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com",
      search: entities.map((entity) => ({ id: entity.entity_id, name: entity.name })),
      insightsCount: insights?.results.entities.length ?? 0,
      llmConfigured: Boolean(process.env.LLM_API_KEY),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Qloo connectivity check failed." },
      { status: 502 },
    );
  }
}
