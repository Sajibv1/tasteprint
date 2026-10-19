"use client";

import { useState } from "react";
import Image from "next/image";
import { giftMedia, giftPrice, safeRetailerUrl } from "@/lib/gift-media";
import { Icon, type IconName } from "./Icon";

export interface CollectionItem {
  id: string;
  title: string;
  brand: string;
  category: string;
  price: number;
  image: string | null;
  imageKind?: "product" | "cultural" | "editorial";
  entityName: string;
  entityType: string;
  buyUrl: string;
}

const SECTIONS: { category: string; label: string; icon: IconName; copy: string }[] = [
  { category: "Vinyl", label: "For the deep listeners", icon: "headphones", copy: "Records to get lost in, from art-pop to Japanese ambient." },
  { category: "Cinema", label: "For the film people", icon: "film", copy: "Worlds worth revisiting, in editions worth keeping." },
  { category: "Reading", label: "For the curious minds", icon: "book", copy: "Stories, art and ideas for their next quiet afternoon." },
  { category: "Home", label: "For the everyday rituals", icon: "coffee", copy: "Considered little objects that make a space feel like theirs." },
  { category: "Photography", label: "For the moment keepers", icon: "camera", copy: "A different way to see the ordinary." },
  { category: "Creative Kits", label: "For the hands-on types", icon: "spark", copy: "Something to make, piece together and make their own." },
];

function CollectionImage({ item }: { item: CollectionItem }) {
  const [failed, setFailed] = useState(false);
  const media = giftMedia(item);
  return <div className={`collection-image ${item.category === "Vinyl" ? "collection-record" : ""}`}>
    {!failed ? <Image src={media.src} alt={media.alt} fill sizes="(max-width: 640px) 70vw, (max-width: 1000px) 40vw, 300px" onError={() => setFailed(true)} /> : <Icon name="gift" size={34} />}
    <span>{failed ? "Image unavailable" : media.caption}</span>
  </div>;
}

export function Collection({ items, total, categoryCounts, onChooseCategory }: { items: CollectionItem[]; total: number; categoryCounts: Record<string, number>; onChooseCategory: (category: string) => void }) {
  const [category, setCategory] = useState("Vinyl");
  const current = SECTIONS.find((section) => section.category === category)!;
  const visible = items.filter((item) => item.category === category).slice(0, 4);
  return <section id="collection" className="collection-section" aria-labelledby="collection-heading">
    <header className="section-heading"><div><span className="subtle-label">Good taste takes many forms</span><h2 id="collection-heading">A world beyond gift guides.</h2><p>{total} curated ideas across {Object.keys(categoryCounts).length} categories. The right connection makes one of them theirs.</p></div><span className="collection-count"><Icon name="gift" size={19} />The collection</span></header>
    <div className="collection-tabs filter-tabs" aria-label="Explore the collection">{SECTIONS.map((section) => <button type="button" key={section.category} aria-pressed={category === section.category} onClick={() => setCategory(section.category)}><Icon name={section.icon} size={17} />{section.category}</button>)}</div>
    <div className="collection-description"><div><h3>{current.label}</h3><p>{current.copy}</p></div><button type="button" className="text-link" onClick={() => onChooseCategory(category)}>Personalize these gifts<Icon name="arrow" size={17} /></button></div>
    <div className="collection-grid">{visible.map((item) => <a key={item.id} href={safeRetailerUrl(item.buyUrl)} target="_blank" rel="noreferrer" className="collection-item" aria-label={`${item.title}, approximately ${giftPrice(item.price)}, view at retailer`}><CollectionImage item={item} /><div className="collection-item-meta"><span>{item.brand}</span><span>{giftPrice(item.price)}</span></div><h4>{item.title}<Icon name="arrow-up-right" size={17} /></h4></a>)}</div>
    <p className="collection-note">A look inside the collection, before personalization. Prices are estimates; retailer links show current options.</p>
  </section>;
}
