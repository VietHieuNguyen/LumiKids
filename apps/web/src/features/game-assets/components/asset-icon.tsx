import type { ReactNode } from "react";

const paths: Record<"image" | "search" | "plus" | "refresh" | "arrow", ReactNode> = {
  image: <><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8" cy="8" r="1.5" /><path d="m4 17 5-5 4 4 3-3 5 5" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: <path d="M20 10a8 8 0 1 0-2 8M20 4v6h-6" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
};

export function AssetIcon({ name, className = "h-5 w-5" }: { name: keyof typeof paths; className?: string }) {
  return <svg className={`shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
