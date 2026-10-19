"use client";

import type { GiftItem } from "@/lib/agent/types";
import { Icon } from "./Icon";

export function ContributorBar({ item }: { item: GiftItem }) {
  const contributors = item.contributors ?? [];
  if (!contributors.length) return null;
  return <div className="contributor-bar"><span className="subtle-label">Taste signals behind this pick</span>{contributors.map((contributor) => <span key={`${contributor.name}-${contributor.via ?? ""}`}><Icon name="link" size={12} />{contributor.name}{contributor.via && <small>via {contributor.via}</small>}<b>{contributor.sharePct}%</b></span>)}{item.hops === 2 && <small className="second-hop-note">Discovered through a second taste connection</small>}</div>;
}
