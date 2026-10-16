import { NextResponse } from "next/server";
import { catalog } from "@/lib/catalog";
import catalogEntityMap from "@/data/catalog-entities.json";

export const maxDuration = 30;

const ENTITY_IMAGES = catalogEntityMap as Record<string, { image?: string }>;

// Compact, cacheable product list for the pre-search pin browser.
// No Qloo calls — images come from the build-time entity mapping.
export async function GET() {
  return NextResponse.json(
    {
      results: catalog.map((item) => ({
        id: item.id,
        title: item.title,
        brand: item.brand,
        price: item.price,
        category: item.category,
        image: ENTITY_IMAGES[item.id]?.image ?? null,
      })),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
