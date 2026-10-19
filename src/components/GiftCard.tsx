"use client";

import type { GiftItem } from "@/lib/agent/types";
import { giftPrice, safeRetailerUrl } from "@/lib/gift-media";
import { ContributorBar } from "./ContributorBar";
import { ProductImage } from "./ProductImage";
import { useSavedGifts } from "./SavedGifts";
import { Icon } from "./Icon";

const SOURCE_LABEL: Record<GiftItem["source"], string> = {
  direct: "Something they love",
  discovery: "An unexpected connection",
  adjacent: "A shared sensibility",
};

export function buyLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host === "amazon.com" || host.endsWith(".amazon.com")) return "Find on Amazon";
    if (host === "etsy.com" || host.endsWith(".etsy.com")) return "Find on Etsy";
    if (host.includes("a24films.com")) return "Explore A24";
    if (host.includes("criterion.com")) return "Shop Criterion";
    if (host.includes("mubi.com")) return "Explore MUBI";
    return "View at retailer";
  } catch { return "View at retailer"; }
}

export function GiftCard({ item, compact = false, onAvoid, busy }: {
  item: GiftItem;
  compact?: boolean;
  onAvoid?: (item: GiftItem) => void;
  busy: boolean;
}) {
  const { gifts, toggle } = useSavedGifts();
  const saved = gifts.some((gift) => gift.id === item.id);
  return <article className={`gift-card ${compact ? "gift-card-compact" : ""}`}>
    <div className="gift-visual">
      <ProductImage item={item} compact={compact} />
      <button type="button" className={`save-gift ${saved ? "is-saved" : ""}`} aria-label={`${saved ? "Unsave" : "Save"} ${item.title}`} aria-pressed={saved} onClick={() => toggle(item)}><Icon name="heart" size={18} /></button>
      {!compact && <span className={`gift-source source-${item.source}`}><span />{SOURCE_LABEL[item.source]}</span>}
    </div>
    <div className="gift-content">
      <div className="gift-category"><span>{item.category}</span><span>{giftPrice(item.price, item.currency)}</span></div>
      <h4>{item.title}</h4>
      {!compact && <p className="gift-description">{item.description}</p>}
      <div className="gift-affinity"><div className="affinity-track" role="img" aria-label={`${item.affinityPct}% cultural affinity`}><span style={{ width: `${Math.max(0, Math.min(100, item.affinityPct))}%` }} /></div><span>{item.affinityPct}% taste affinity</span></div>
      <details className="gift-evidence">
        <summary>Why it fits<Icon name="chevron" size={14} /></summary>
        <div><p>{item.reason}</p><ContributorBar item={item} /></div>
      </details>
      <div className="gift-actions">
        <a href={safeRetailerUrl(item.buyUrl)} target="_blank" rel="noreferrer" className="text-link">{buyLabel(item.buyUrl)}<Icon name="arrow-up-right" size={14} /></a>
        {onAvoid && <button type="button" disabled={busy} onClick={() => onAvoid(item)} className="text-button" title="Exclude this gift from the next selection">Not for them</button>}
      </div>
    </div>
  </article>;
}
