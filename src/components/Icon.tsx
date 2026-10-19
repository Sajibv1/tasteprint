import type { CSSProperties } from "react";

export type IconName = "arrow" | "arrow-up-right" | "plus" | "close" | "check" | "heart" | "search" | "spark" | "play" | "pause" | "chevron" | "refresh" | "sliders" | "globe" | "grid" | "headphones" | "film" | "book" | "camera" | "gift" | "coffee" | "mic" | "send" | "link" | "menu" | "volume" | "info" | "stop" | "expand";

const paths: Record<IconName, React.ReactNode> = {
  arrow: <><path d="M4 12h15m-6-6 6 6-6 6" /></>,
  "arrow-up-right": <><path d="M6 18 18 6M6 6h12v12" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" /><path d="M20 2v4m-2-2h4" /></>,
  play: <path d="m9 5 11 7-11 7V5Z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 6.1A8 8 0 0 1 19.6 10M4.4 14a8 8 0 0 0 13.5 3.9" /></>,
  sliders: <><path d="M4 7h7m4 0h5M4 17h3m4 0h9" /><circle cx="13" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
  grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
  headphones: <><path d="M4 14v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="12" width="5" height="8" rx="2" /><rect x="16" y="12" width="5" height="8" rx="2" /></>,
  film: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 8h4m-4 8h4M17 8h4m-4 8h4" /></>,
  book: <><path d="M12 6C9 4 5 4 3 5v15c3-1 6-1 9 1 3-2 6-2 9-1V5c-2-1-6-1-9 1Zm0 0v15" /></>,
  camera: <><path d="m8 6 2-3h4l2 3h4a2 2 0 0 1 2 2v11H2V8a2 2 0 0 1 2-2h4Z" /><circle cx="12" cy="12" r="4" /></>,
  gift: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v9h14v-9M12 8v13" /><path d="M12 8H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z" /></>,
  coffee: <><path d="M4 8h12v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8ZM16 8h2a3 3 0 0 1 0 6h-2M3 23h15M8 2v2m5-2v2" /></>,
  mic: <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-3 0h6" /></>,
  send: <path d="m21 3-7 18-4-7-7-4 18-7Zm0 0L10 14" />,
  link: <><path d="m10 13 4-4m-5 6-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 1)" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  volume: <><path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a5 5 0 0 1 0 8m3-11a9 9 0 0 1 0 14" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.1" /></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
};

export function Icon({ name, size = 20, className = "", style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>{paths[name]}</svg>;
}

export function Fingerprint({ size = 36, className = "" }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" className={className}>
    <path d="M5 18C5 8 12 3 20 3s15 6 15 15M9 26V18a11 11 0 0 1 22 0v7M5 24v4m30-4v4M13 29V18a7 7 0 0 1 14 0v13M17 33V18a3 3 0 0 1 6 0v17M9 32v2m4 0v3m18-6v3M20 18v20" />
  </svg>;
}
