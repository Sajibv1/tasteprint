"use client";

import { useState } from "react";
import type { GiftItem } from "@/lib/agent/types";
import { GiftCard } from "./GiftCard";
import { Icon } from "./Icon";

export function GiftShelf({ items, busy, onAvoid }: { items: GiftItem[]; busy: boolean; onAvoid: (item: GiftItem) => void }) {
  const [category, setCategory] = useState("All gifts");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("curated");
  const [shown, setShown] = useState(8);
  const categories = [...new Set(items.map((item) => item.category))].sort();
  const activeCategory = categories.includes(category) ? category : "All gifts";
  const filtered = items.filter((item) => (activeCategory === "All gifts" || item.category === activeCategory) && `${item.title} ${item.brand} ${item.entityName}`.toLowerCase().includes(query.toLowerCase().trim()));
  if (sort === "price-low") filtered.sort((a, b) => a.price - b.price);
  if (sort === "price-high") filtered.sort((a, b) => b.price - a.price);
  if (sort === "affinity") filtered.sort((a, b) => b.affinityPct - a.affinityPct);

  return <section className="gift-shelf" aria-labelledby="shelf-heading">
    <header className="section-heading"><div><span className="subtle-label">Keep the curiosity going</span><h2 id="shelf-heading">More ways to get them.</h2><p>{items.length} more possibilities, chosen for their taste.</p></div><label className="shelf-sort"><span className="sr-only">Sort gifts</span><Icon name="sliders" size={16} /><select aria-label="Sort gifts" value={sort} onChange={(event) => setSort(event.target.value)}><option value="curated">Curated order</option><option value="affinity">Highest affinity</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label></header>
    <div className="shelf-toolbar"><div className="filter-tabs" aria-label="Filter gifts by category">{["All gifts", ...categories].map((entry) => <button type="button" key={entry} aria-pressed={activeCategory === entry} onClick={() => { setCategory(entry); setShown(8); }}>{entry}</button>)}</div><label className="shelf-search"><Icon name="search" size={16} /><input aria-label="Search gift ideas" placeholder="Find an idea…" value={query} onChange={(event) => { setQuery(event.target.value); setShown(8); }} /></label></div>
    {filtered.length > 0 ? <><div className="shelf-grid">{filtered.slice(0, shown).map((item) => <GiftCard key={item.id} item={item} busy={busy} onAvoid={onAvoid} />)}</div>{shown < filtered.length && <button type="button" className="button button-secondary shelf-more" onClick={() => setShown((value) => value + 8)}>Explore {Math.min(8, filtered.length - shown)} more ideas<Icon name="plus" size={17} /></button>}</> : <div className="shelf-empty"><Icon name="search" size={28} /><h3>No gifts in this view.</h3><p>Try a different search or explore all the suggestions.</p><button type="button" className="button button-secondary" onClick={() => { setCategory("All gifts"); setQuery(""); }}>Clear filters</button></div>}
  </section>;
}
