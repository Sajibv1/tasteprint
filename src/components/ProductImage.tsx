"use client";

import Image from "next/image";
import { useState } from "react";
import type { GiftItem } from "@/lib/agent/types";
import { giftMedia } from "@/lib/gift-media";
import { Icon } from "./Icon";

export function ProductImage({ item, compact = false }: { item: GiftItem; compact?: boolean }) {
  const media = giftMedia(item);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return <div className={`product-image ${compact ? "product-image-compact" : ""}`}>
    {failedSrc !== media.src ? <Image src={media.src} alt={media.alt} fill sizes={compact ? "100px" : "(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 400px"} onError={() => setFailedSrc(media.src)} className={item.category === "Vinyl" && item.imageKind === "product" ? "album-cover" : ""} /> : <div className="product-image-fallback"><Icon name={item.category === "Reading" ? "book" : item.category === "Vinyl" ? "headphones" : "gift"} size={32} /><span>{item.category}</span></div>}
    {!compact && <span className="image-caption">{failedSrc === media.src ? "Image unavailable" : media.caption}</span>}
  </div>;
}
