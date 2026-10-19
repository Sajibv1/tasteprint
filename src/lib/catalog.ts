import catalogData from "@/data/catalog.json";
import catalogEntityMap from "@/data/catalog-entities.json";
import { curatedGifts } from "@/data/curated-gifts";

export interface QlooRef {
  query: string;
  type: string;
  entityId?: string;
}

export interface CatalogItem {
  id: string;
  title: string;
  brand: string;
  price: number;
  currency: string;
  image: string;
  imageKind?: "product" | "cultural" | "editorial";
  buyUrl: string;
  category: string;
  description: string;
  inventory: "in_stock" | "low_stock" | "preorder";
  qloo: QlooRef;
}

export interface CatalogEntity {
  entity_id: string;
  name: string;
  type: string;
  image?: string;
}

const entityMap = catalogEntityMap as Record<string, CatalogEntity>;

export const catalog: CatalogItem[] = [
  ...(catalogData as CatalogItem[]),
  ...curatedGifts.map((entry): CatalogItem => {
    const entity = entityMap[entry.entityRef];
    if (!entity) throw new Error(`Missing Qloo reference for ${entry.id}`);
    return {
      id: entry.id,
      title: entry.title,
      brand: entry.brand,
      price: entry.price,
      currency: "USD",
      category: entry.category,
      description: entry.description,
      image: entry.image ?? "",
      imageKind: entry.image ? "product" : undefined,
      buyUrl: entry.buyUrl ?? `https://www.amazon.com/s?k=${encodeURIComponent(`${entry.brand} ${entry.title}`)}`,
      inventory: "in_stock",
      qloo: { query: entity.name, type: entity.type, entityId: entity.entity_id },
    };
  }),
];

const byEntityId = new Map(Object.values(entityMap).map((entry) => [entry.entity_id, entry]));

export function mappedCatalogEntity(item: CatalogItem): CatalogEntity | undefined {
  return item.qloo.entityId ? byEntityId.get(item.qloo.entityId) : entityMap[item.id];
}

export const catalogCategories = [...new Set(catalog.map((item) => item.category))].sort();

export function catalogImage(item: CatalogItem, culturalImage?: string | null): {
  image: string | null;
  imageKind: "product" | "cultural" | "editorial";
} {
  if (item.image && !item.image.includes("picsum.photos")) {
    return { image: item.image, imageKind: item.imageKind ?? "product" };
  }
  return { image: culturalImage ?? mappedCatalogEntity(item)?.image ?? null, imageKind: "cultural" };
}

export function formatPrice(price: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(price);
}
