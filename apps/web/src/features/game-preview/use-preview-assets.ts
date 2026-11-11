"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { getGameContentAssetIds } from "@lumikids/shared";
import type { GameContent } from "@lumikids/shared";
import { createPreviewAssetResolver } from "./asset-resolver";
import type { PreviewAssetReader } from "./asset-resolver";

export function usePreviewAssets(
  content: GameContent,
  reader: PreviewAssetReader,
) {
  const resolver = useMemo(
    () => createPreviewAssetResolver(getGameContentAssetIds(content), reader),
    [content, reader],
  );
  const snapshot = useSyncExternalStore(
    resolver.subscribe,
    resolver.getSnapshot,
    resolver.getServerSnapshot,
  );
  useEffect(() => {
    resolver.start();
    const visible = () => {
      if (document.visibilityState === "visible") resolver.refreshIfNeeded();
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", resolver.refreshIfNeeded);
    return () => {
      resolver.stop();
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", resolver.refreshIfNeeded);
    };
  }, [resolver]);
  return { snapshot, resolver };
}
