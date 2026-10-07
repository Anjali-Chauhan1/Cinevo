import type { ReactNode } from "react";
export type IconName = "play" | "search" | "trending" | "live" | "film" | "arrow" | "close" | "menu" | "plus" | "wallet" | "check";
const paths: Record<IconName, ReactNode> = {
  play: <path d="m9 5 11 7-11 7Z" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  trending: <><path d="m3 17 6-6 4 4 8-10" /><path d="M15 5h6v6" /></>,
  live: <><circle cx="12" cy="12" r="2" /><path d="M7 7a7 7 0 0 0 0 10M17 7a7 7 0 0 1 0 10M4 4a11 11 0 0 0 0 16M20 4a11 11 0 0 1 0 16" /></>,
  film: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  plus: <path d="M12 4v16M4 12h16" />,
  wallet: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 8V5l14-3v3M21 11h-6v5h6" /></>,
  check: <path d="m5 12 4 4L19 6" />,
};
export function Icon({ name, size = 20, className = "" }: { name: IconName; size?: number; className?: string }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={name === "play" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>{paths[name]}</svg>;
}
