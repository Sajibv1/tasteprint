import { NextResponse } from "next/server";
import { searchEntities } from "@/lib/qloo/client";

export const maxDuration = 30;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().replace(/\s+/g, " ");
  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }
  try {
    const entities = await searchEntities(query, { take: 6 });
    const seen = new Set<string>();
    const results = [];
    for (const entity of entities) {
      if (seen.has(entity.entity_id)) continue;
      seen.add(entity.entity_id);
      const popularity =
        typeof entity.popularity === "number"
          ? entity.popularity
          : typeof entity.properties?.popularity === "number"
            ? entity.properties.popularity
            : 0;
      results.push({
        id: entity.entity_id,
        name: entity.name,
        type: entity.type,
        popularity: Math.round(popularity * 100) / 100,
      });
    }
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
