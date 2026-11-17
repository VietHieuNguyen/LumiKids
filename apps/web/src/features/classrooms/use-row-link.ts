"use client";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";

/**
 * Makes a whole table row open a page. The row keeps a real <Link> on its main cell for keyboard
 * and screen-reader users; clicks on that link or on other controls are left to them.
 */
export function useRowLink() {
  const router = useRouter();
  return (href: string) => ({
    onClick(event: MouseEvent<HTMLElement>) {
      if (event.defaultPrevented || (event.target as HTMLElement).closest("a, button, input, select, textarea")) return;
      if (event.metaKey || event.ctrlKey) window.open(href, "_blank", "noopener");
      else router.push(href);
    },
  });
}
