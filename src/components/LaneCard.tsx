"use client";

import type { GiftPick, LaneKey, RefineAction } from "@/lib/agent/types";
import { giftPrice } from "@/lib/gift-media";
import { GiftCard } from "./GiftCard";
import { Icon, type IconName } from "./Icon";

export const LANE_META: Record<LaneKey, { label: string; description: string; icon: IconName }> = {
  safe: { label: "The sure thing", description: "Right in their comfort zone", icon: "heart" },
  surprise: { label: "The unexpected", description: "A new side of their taste", icon: "spark" },
  bundle: { label: "Better together", description: "A small world, thoughtfully assembled", icon: "gift" },
};

export function LaneCard({ pick, onRefine, busy }: {
  pick: GiftPick;
  onRefine: (action: RefineAction) => void;
  busy: boolean;
}) {
  const meta = LANE_META[pick.lane];
  return <article className={`lane lane-${pick.lane}`}>
    <header className="lane-heading"><span className="lane-icon"><Icon name={meta.icon} size={20} /></span><div><h3>{meta.label}</h3><p>{meta.description}</p></div></header>
    <div className="lane-items">{pick.items.map((item) => <GiftCard key={item.id} item={item} compact={pick.lane === "bundle" && pick.items.length > 1} onAvoid={(gift) => onRefine({ kind: "avoid", itemIds: [gift.id] })} busy={busy} />)}</div>
    <div className="lane-story"><strong>{pick.headline}</strong><p>{pick.explanation}</p></div>
    <footer>{pick.items.length > 1 && <div className="bundle-total"><span>Bundle total</span><strong>{giftPrice(pick.totalPrice)}</strong></div>}<button type="button" className="text-link" disabled={busy} onClick={() => onRefine({ kind: "more", lane: pick.lane, itemIds: pick.items.map((item) => item.id) })}><Icon name="refresh" size={14} />Show another {pick.lane === "bundle" ? "bundle" : "idea"}</button></footer>
  </article>;
}
