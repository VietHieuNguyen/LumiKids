"use client";
import { useCallback, useEffect, useState } from "react";
import { classroomError } from "./api";

/**
 * Loads one resource and reloads it when `key` changes or `reload()` is called. A stale response (older key,
 * or a request aborted by unmount) never overwrites newer data.
 */
export function useResource<T>(load: ((signal: AbortSignal) => Promise<T>) | null, key: string) {
  const [state, setState] = useState<{ key: string; data: T | null; error: string }>({ key: "", data: null, error: "" });
  const [nonce, setNonce] = useState(0);
  const requestKey = `${key}#${nonce}`;
  useEffect(() => {
    if (!load) return;
    const abort = new AbortController();
    load(abort.signal)
      .then((data) => {
        if (!abort.signal.aborted) setState({ key: requestKey, data, error: "" });
      })
      .catch((failure: unknown) => {
        if (!abort.signal.aborted) setState((current) => ({ key: requestKey, data: current.data, error: classroomError(failure) }));
      });
    return () => abort.abort();
    // `load` is rebuilt every render; `requestKey` is what decides a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, Boolean(load)]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  /** Replace the data with a mutation's response, without another request. */
  const replace = useCallback((data: T) => setState((current) => ({ ...current, data, error: "" })), []);
  return {
    data: state.data,
    error: state.error,
    loading: state.key !== requestKey,
    reload,
    replace,
  };
}
