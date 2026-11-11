import type { AssetReadUrl } from "../game-assets/types";

/** Read-only port: Preview has no upload/session/event persistence capability. */
export interface PreviewAssetReader {
  getReadUrl: (assetId: string, force?: boolean) => Promise<AssetReadUrl>;
}
export type PreviewAssetIssueCode =
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INACTIVE"
  | "UNAVAILABLE"
  | "IMAGE_FAILED";
export interface PreviewAssetIssue {
  assetId: string;
  code: PreviewAssetIssueCode;
  message: string;
}
export interface PreviewAssetSnapshot {
  status: "loading" | "ready" | "error";
  urls: Readonly<Record<string, string>>;
  revisions: Readonly<Record<string, number>>;
  issues: readonly PreviewAssetIssue[];
  pending: number;
  total: number;
  hasLoaded: boolean;
  refreshing: boolean;
}
type Timer = ReturnType<typeof setTimeout>;
export interface PreviewAssetClock {
  now: () => number;
  schedule: (callback: () => void, delay: number) => Timer;
  cancel: (timer: Timer) => void;
}
interface Entry {
  resource?: AssetReadUrl;
  revision: number;
  pending: boolean;
  issue?: PreviewAssetIssue;
}
const RENEW_BEFORE_MS = 30000;
function issueFor(assetId: string, error: unknown): PreviewAssetIssue {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? error.status
      : undefined;
  switch (status) {
    case 410:
      return {
        assetId,
        code: "UNAVAILABLE",
        message: "Quyền tải ảnh cho bản chơi thử đã hết hạn. Hãy tạo lại trò chơi.",
      };
    case 404:
      return {
        assetId,
        code: "NOT_FOUND",
        message: "Ảnh không tồn tại trong thư viện.",
      };
    case 401:
      return {
        assetId,
        code: "UNAUTHORIZED",
        message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      };
    case 403:
      return {
        assetId,
        code: "FORBIDDEN",
        message: "Tài khoản chưa có quyền đọc ảnh này.",
      };
    case 409:
      return {
        assetId,
        code: "INACTIVE",
        message: "Ảnh đã ngừng sử dụng và không thể đọc bằng tài khoản này.",
      };
    default:
      return {
        assetId,
        code: "UNAVAILABLE",
        message: "Chưa lấy được ảnh. Vui lòng kiểm tra kết nối hoặc thử lại.",
      };
  }
}

export function createPreviewAssetResolver(
  assetIds: readonly string[],
  reader: PreviewAssetReader,
  clock: PreviewAssetClock = {
    now: () => Date.now(),
    schedule: (callback, delay) => setTimeout(callback, delay),
    cancel: (timer) => clearTimeout(timer),
  },
) {
  const ids = [...new Set(assetIds)];
  const entries = new Map<string, Entry>(
    ids.map((id) => [id, { revision: 0, pending: true }]),
  );
  const listeners = new Set<() => void>();
  const inFlight = new Map<string, Promise<void>>();
  const imageRetries = new Set<string>();
  let active = false;
  let generation = 0;
  let hasLoaded = ids.length === 0;
  let timer: Timer | undefined;
  function buildSnapshot(): PreviewAssetSnapshot {
    const all = [...entries.entries()];
    const issues = all.flatMap(([, entry]) =>
      entry.issue ? [entry.issue] : [],
    );
    const pending = all.filter(([, entry]) => entry.pending).length;
    if (!pending && !issues.length) hasLoaded = true;
    return {
      status: pending ? "loading" : issues.length ? "error" : "ready",
      urls: Object.fromEntries(
        all.flatMap(([id, entry]) =>
          entry.resource ? [[id, entry.resource.url]] : [],
        ),
      ),
      revisions: Object.fromEntries(
        all.map(([id, entry]) => [id, entry.revision]),
      ),
      issues,
      pending,
      total: ids.length,
      hasLoaded,
      refreshing: inFlight.size > 0,
    };
  }
  let snapshot = buildSnapshot();
  const serverSnapshot = snapshot;
  function publish() {
    snapshot = buildSnapshot();
    listeners.forEach((listener) => listener());
  }
  function scheduleRenewal() {
    if (timer !== undefined) clock.cancel(timer);
    timer = undefined;
    if (!active) return;
    const expirations = [...entries.entries()].flatMap(([id, entry]) =>
      entry.resource && !inFlight.has(id)
        ? [Date.parse(entry.resource.expiresAt)]
        : [],
    );
    if (!expirations.length) return;
    timer = clock.schedule(
      () => {
        timer = undefined;
        refreshIfNeeded();
      },
      Math.max(Math.min(...expirations) - clock.now() - RENEW_BEFORE_MS, 1000),
    );
  }
  function read(id: string, force: boolean, version: number): Promise<void> {
    const running = inFlight.get(id);
    if (running) return running;
    const entry = entries.get(id);
    if (!entry || !active || version !== generation) return Promise.resolve();
    entry.pending = !entry.resource;
    entry.issue = undefined;
    const request = Promise.resolve()
      .then(() => {
        if (!active || version !== generation)
          throw new Error("Resolver stopped.");
        return reader.getReadUrl(id, force);
      })
      .then((resource) => {
        if (!active || version !== generation) return;
        if (
          !(resource.url.startsWith("/") && !resource.url.startsWith("//")) &&
          !/^https?:\/\//i.test(resource.url)
        )
          throw new Error("Invalid image URL.");
        if (!resource.url.startsWith("/")) {
          const url = new URL(resource.url);
          if (url.username || url.password)
            throw new Error("Invalid image URL credentials.");
        }
        if (
          !Number.isFinite(Date.parse(resource.expiresAt)) ||
          Date.parse(resource.expiresAt) <= clock.now() ||
          !Number.isFinite(resource.expiresIn) ||
          resource.expiresIn <= 0
        )
          throw new Error("Expired image URL.");
        entry.resource = resource;
        entry.revision++;
        entry.pending = false;
        entry.issue = undefined;
      })
      .catch((error: unknown) => {
        if (!active || version !== generation) return;
        entry.resource = undefined;
        entry.pending = false;
        entry.issue = issueFor(id, error);
      })
      .finally(() => {
        if (inFlight.get(id) === request) inFlight.delete(id);
        if (!active || version !== generation) return;
        publish();
        scheduleRenewal();
      });
    inFlight.set(id, request);
    publish();
    return request;
  }
  async function batch(
    selected: readonly string[],
    force: boolean,
    version: number,
  ) {
    let index = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, selected.length) }, async () => {
        while (active && version === generation && index < selected.length)
          await read(selected[index++], force, version);
      }),
    );
    if (active && version === generation) scheduleRenewal();
  }
  function refreshIfNeeded() {
    if (!active) return;
    const selected = ids.filter((id) => {
      const entry = entries.get(id)!;
      return (
        entry.resource &&
        Date.parse(entry.resource.expiresAt) <= clock.now() + RENEW_BEFORE_MS
      );
    });
    void batch(selected, true, generation);
  }
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (active) return;
      active = true;
      const version = ++generation;
      // StrictMode cleanup can cancel this microtask before any request is sent.
      queueMicrotask(() => {
        if (!active || version !== generation) return;
        const selected = ids.filter(
          (id) =>
            !entries.get(id)?.resource ||
            Date.parse(entries.get(id)!.resource!.expiresAt) <=
              clock.now() + RENEW_BEFORE_MS,
        );
        void batch(selected, false, version);
        scheduleRenewal();
      });
    },
    stop() {
      active = false;
      generation++;
      inFlight.clear();
      if (timer !== undefined) clock.cancel(timer);
      timer = undefined;
    },
    refreshIfNeeded,
    retry() {
      imageRetries.clear();
      return active ? batch(ids, true, generation) : Promise.resolve();
    },
    reportImageError(id: string, failedUrl?: string, revision?: number) {
      const entry = entries.get(id);
      if (
        !active ||
        !entry?.resource ||
        (failedUrl && failedUrl !== entry.resource.url) ||
        (revision !== undefined && revision !== entry.revision)
      )
        return;
      entry.resource = undefined;
      entry.pending = false;
      if (!imageRetries.has(id)) {
        imageRetries.add(id);
        void read(id, true, generation);
      } else {
        entry.issue = {
          assetId: id,
          code: "IMAGE_FAILED",
          message:
            "Ảnh chưa tải được sau khi làm mới URL. Hãy thử lại hoặc kiểm tra file ảnh.",
        };
        publish();
        scheduleRenewal();
      }
    },
  };
}
export type PreviewAssetResolver = ReturnType<
  typeof createPreviewAssetResolver
>;
