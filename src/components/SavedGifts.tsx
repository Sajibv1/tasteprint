"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { GiftItem } from "@/lib/agent/types";
import { giftPrice, safeRetailerUrl } from "@/lib/gift-media";
import { ProductImage } from "./ProductImage";
import { Icon } from "./Icon";

const SAVED_KEY = "tasteprint.saved.v1";
const SavedContext = createContext<{
  gifts: GiftItem[];
  toggle: (gift: GiftItem) => void;
  open: () => void;
} | null>(null);

function validGift(value: unknown): value is GiftItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return ["id", "title", "brand", "currency", "category", "entityName", "entityType", "buyUrl"].every((key) => typeof item[key] === "string")
    && typeof item.price === "number" && Number.isFinite(item.price)
    && (typeof item.image === "string" || item.image === null);
}

export function SavedGiftsProvider({ children }: { children: ReactNode }) {
  const [gifts, setGifts] = useState<GiftItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [opened, setOpened] = useState(false);
  const [toast, setToast] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved: unknown = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]");
        if (Array.isArray(saved)) setGifts(saved.filter(validGift).slice(0, 50));
      } catch { /* A private or full browser still gets an in-session shortlist. */ }
      setLoaded(true);
    });
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(gifts)); } catch { /* Session state remains usable. */ }
  }, [gifts, loaded]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!opened) { if (dialog.open) dialog.close(); return; }
    dialog.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; if (dialog.open) dialog.close(); };
  }, [opened]);

  function toggle(gift: GiftItem) {
    const exists = gifts.some((item) => item.id === gift.id);
    if (!exists && gifts.length >= 50) { setToast("Your shortlist is full. Remove a gift to save another."); }
    else {
      setGifts((current) => exists ? current.filter((item) => item.id !== gift.id) : [...current, gift]);
      setToast(exists ? "Removed from your shortlist" : "Saved to your shortlist");
    }
    setCopied(false);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2800);
  }

  const shortlistText = gifts.map((gift) => `${gift.title} — ${giftPrice(gift.price, gift.currency)}\n${safeRetailerUrl(gift.buyUrl) ?? ""}`).join("\n\n");
  async function copyShortlist() {
    try { await navigator.clipboard.writeText(`My Tasteprint shortlist\n\n${shortlistText}`); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
  }

  return <SavedContext.Provider value={{ gifts, toggle, open: () => { setOpened(true); setCopied(false); setCopyError(false); } }}>
    {children}
    <div className={`toast ${toast ? "toast-visible" : ""}`} role="status">{toast && <><Icon name="check" size={16} />{toast}</>}</div>
    <dialog ref={dialogRef} className="shortlist-dialog" aria-labelledby="shortlist-title" onCancel={() => setOpened(false)} onClick={(event) => { if (event.target === event.currentTarget) setOpened(false); }}>
      <div className="shortlist-panel">
        <header><div><span className="subtle-label">The good ones, all together</span><h2 id="shortlist-title">Your shortlist<span>{gifts.length}</span></h2></div><button type="button" className="icon-button" aria-label="Close shortlist" onClick={() => setOpened(false)}><Icon name="close" /></button></header>
        {gifts.length === 0 ? <div className="shortlist-empty"><Icon name="heart" size={42} /><h3>A few thoughtful possibilities.</h3><p>Tap the heart on any gift to keep it here while you explore.</p><button type="button" className="button button-primary" onClick={() => { setOpened(false); document.getElementById("discover")?.scrollIntoView({ behavior: "smooth" }); }}>Find their gifts<Icon name="arrow" size={18} /></button></div> : <>
          <div className="shortlist-items">{gifts.map((gift) => <article key={gift.id}>
            <ProductImage item={gift} compact />
            <div><span className="subtle-label">{gift.category}</span><h3>{gift.title}</h3><p>{giftPrice(gift.price, gift.currency)} <span>estimated</span></p><a href={safeRetailerUrl(gift.buyUrl)} target="_blank" rel="noreferrer" className="text-link">View at retailer<Icon name="arrow-up-right" size={13} /></a></div>
            <button type="button" className="icon-button" aria-label={`Remove ${gift.title} from shortlist`} onClick={() => toggle(gift)}><Icon name="close" size={16} /></button>
          </article>)}</div>
          <footer><button type="button" className="button button-primary" onClick={() => void copyShortlist()}><Icon name={copied ? "check" : "link"} size={17} />{copied ? "Shortlist copied" : "Copy shortlist"}</button><p>Saved in this browser. Confirm prices and availability with the retailer.</p>{copyError && <label className="copy-fallback">Select and copy your shortlist<textarea readOnly value={shortlistText} onFocus={(event) => event.target.select()} /></label>}</footer>
        </>}
      </div>
    </dialog>
  </SavedContext.Provider>;
}

export function useSavedGifts() {
  const context = useContext(SavedContext);
  if (!context) throw new Error("Saved gifts must be used within SavedGiftsProvider");
  return context;
}
