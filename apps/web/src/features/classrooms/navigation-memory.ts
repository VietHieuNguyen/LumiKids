"use client";
import { useRef, useState } from "react";

/** Retains transient state across client-side navigation in this tab. Never writes to storage or URLs. */
export function useNavigationMemory<T>(cache: Map<string, T>, key: string | undefined, initial: () => T) {
  const [value, setValue] = useState(() => (key ? cache.get(key) : undefined) ?? initial());
  const current = useRef(value);

  function update(change: (previous: T) => T) {
    const next = change(current.current);
    if (key) {
      cache.delete(key);
      cache.set(key, next);
      if (cache.size > 20) {
        const oldest = cache.keys().next();
        if (!oldest.done) cache.delete(oldest.value);
      }
    }
    current.current = next;
    setValue(next);
  }

  function forget() {
    if (key) cache.delete(key);
  }

  return { value, update, forget };
}
