import { NextResponse } from "next/server";
import { recommend, warmCatalog } from "@/lib/agent/pipeline";
import { QlooError } from "@/lib/qloo/client";
import type { RecommendRequest } from "@/lib/agent/types";

export const maxDuration = 60;

export async function POST(request: Request) {
  warmCatalog();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ success: false, error: "Request body must be a JSON object." }, { status: 400 });
  }

  try {
    const result = await recommend(body as RecommendRequest);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof QlooError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return NextResponse.json({ success: false, error: error.message }, { status });
    }
    console.error("recommend failed:", error);
    return NextResponse.json({ success: false, error: "Something went wrong building the recommendations." }, { status: 500 });
  }
}
