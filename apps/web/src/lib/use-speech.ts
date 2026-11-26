"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createSpeechService } from "./speech-service";

export function useSpeech() {
  const [service] = useState(() => createSpeechService());
  const snapshot = useSyncExternalStore(service.subscribe, service.getSnapshot, service.getServerSnapshot);
  useEffect(() => {
    const disconnect = service.connect();
    const hide = () => { if (document.hidden) service.stop(); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", service.stop);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", service.stop);
      disconnect();
    };
  }, [service]);
  return { ...snapshot, speak: service.speak, stop: service.stop, replay: service.replay };
}
