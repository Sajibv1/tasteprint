import type { GiftItem } from "./agent/types";

const EDITORIAL_IMAGES: Record<string, string> = {
  Vinyl: "vinyl", "Audio Gear": "headphones", Cinema: "design", Reading: "books",
  Photography: "camera", Coffee: "coffee", Tea: "coffee", Home: "design", Kitchen: "coffee",
  Stationery: "books", "Art Print": "design", "Creative Kits": "design", Gaming: "design",
};

export function giftMedia(item: Pick<GiftItem, "image" | "imageKind" | "title" | "category" | "entityName" | "entityType">) {
  const usable = item.image && !item.image.includes("picsum.photos") && (item.image.startsWith("https://") || item.image.startsWith("/images/"));
  const product = item.imageKind === "product";
  const cultural = item.imageKind !== "editorial" && item.entityType !== "brand";
  if (usable && (product || cultural)) {
    return {
      src: item.image!,
      alt: product ? item.title : `${item.entityName}, cultural reference`,
      caption: product ? (item.category === "Vinyl" ? "Album artwork" : "Product image") : "Cultural reference",
    };
  }
  return {
    src: `/images/${EDITORIAL_IMAGES[item.category] ?? "design"}.jpg`,
    alt: `${item.category} collection, editorial photograph`,
    caption: "Collection imagery",
  };
}

export function safeRetailerUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch { return undefined; }
}

export function giftPrice(price: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(price);
}
