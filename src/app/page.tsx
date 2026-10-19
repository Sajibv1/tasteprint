import { TasteprintApp } from "@/components/TasteprintApp";
import { catalog, catalogImage, mappedCatalogEntity } from "@/lib/catalog";

export default function Home() {
  const categoryCounts: Record<string, number> = {};
  const previewCounts = new Map<string, number>();
  const collection = catalog.flatMap((item) => {
    categoryCounts[item.category] = (categoryCounts[item.category] ?? 0) + 1;
    const count = previewCounts.get(item.category) ?? 0;
    if (count >= 4) return [];
    previewCounts.set(item.category, count + 1);
    const entity = mappedCatalogEntity(item);
    return [{ id: item.id, title: item.title, brand: item.brand, category: item.category, price: item.price, buyUrl: item.buyUrl, ...catalogImage(item), entityName: entity?.name ?? item.qloo.query, entityType: (entity?.type ?? item.qloo.type).replace("urn:entity:", "") }];
  });
  return <TasteprintApp collection={collection} categoryCounts={categoryCounts} catalogCount={catalog.length} />;
}
