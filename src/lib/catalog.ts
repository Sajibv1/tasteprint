import catalogData from "@/data/catalog.json";

export interface QlooRef {
  query: string;
  type: string;
}

export interface CatalogItem {
  id: string;
  title: string;
  brand: string;
  price: number;
  currency: string;
  image: string;
  buyUrl: string;
  category: string;
  description: string;
  inventory: "in_stock" | "low_stock" | "preorder";
  qloo: QlooRef;
}

export const catalog: CatalogItem[] = catalogData as CatalogItem[];

export function formatPrice(price: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(price);
}
