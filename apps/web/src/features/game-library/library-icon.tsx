import type { ReactNode } from "react";

type IconName = "search" | "filter" | "plus" | "refresh" | "book" | "arrow" | "COUNTING" | "MATCHING" | "CLASSIFICATION";
const paths: Record<IconName, ReactNode> = {
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  filter: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2" fill="currentColor" /><circle cx="15" cy="17" r="2" fill="currentColor" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: <path d="M20 10a8 8 0 1 0-2 8M20 4v6h-6" />,
  book: <path d="M12 6v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  COUNTING: <><circle cx="6" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><circle cx="12" cy="12" r="2" /></>,
  MATCHING: <><rect x="2" y="5" width="7" height="14" rx="2" /><rect x="15" y="5" width="7" height="14" rx="2" /><path d="m9 10 6 4m-6 0 6-4" /></>,
  CLASSIFICATION: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><circle cx="17.5" cy="6.5" r="3.5" /><path d="m6.5 14 4 7h-8Z" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
};

export function LibraryIcon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return <svg className={`shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
