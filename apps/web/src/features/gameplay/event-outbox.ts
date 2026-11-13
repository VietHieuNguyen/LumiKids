import type {
  GameInteraction,
  PlaySessionStatus,
  PlaySessionView,
  SubmitInteractionsResult,
} from "@lumikids/shared";

export interface OutboxError {
  status: number;
  code?: string;
}
export interface OutboxTransport {
  submit: (events: GameInteraction[]) => Promise<SubmitInteractionsResult>;
  sync: () => Promise<PlaySessionView>;
}
export interface OutboxClock {
  schedule: (callback: () => void, delay: number) => unknown;
  cancel: (timer: unknown) => void;
}
export type OutboxState = "idle" | "sending" | "retrying" | "closed" | "failed";
export interface OutboxSnapshot {
  state: OutboxState;
  pending: number;
  sessionStatus: PlaySessionStatus;
}

const MAX_BATCH = 50;
const RETRY_DELAYS = [1000, 2000, 5000, 10000];

function errorOf(value: unknown): OutboxError {
  if (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    typeof value.status === "number"
  )
    return {
      status: value.status,
      code:
        "code" in value && typeof value.code === "string"
          ? value.code
          : undefined,
    };
  return { status: 0 };
}

/** Ordered, single-flight delivery; the server dedups by eventId so resending is safe. */
export function createEventOutbox(
  transport: OutboxTransport,
  onChange: (snapshot: OutboxSnapshot) => void = () => {},
  clock: OutboxClock = {
    schedule: (callback, delay) => setTimeout(callback, delay),
    cancel: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  },
) {
  let queue: GameInteraction[] = [];
  let state: OutboxState = "idle";
  let sessionStatus: PlaySessionStatus = "IN_PROGRESS";
  let inFlight = false;
  let failures = 0;
  let timer: unknown;
  let disposed = false;
  let waiters: (() => void)[] = [];

  const snapshot = (): OutboxSnapshot => ({
    state,
    pending: queue.length,
    sessionStatus,
  });
  function settle(next: OutboxState) {
    state = next;
    onChange(snapshot());
    if (next === "idle" || next === "closed" || next === "failed") {
      const done = waiters;
      waiters = [];
      done.forEach((resolve) => resolve());
    }
  }
  function retryLater() {
    const delay = RETRY_DELAYS[Math.min(failures, RETRY_DELAYS.length - 1)];
    failures++;
    settle("retrying");
    timer = clock.schedule(() => {
      timer = undefined;
      void pump();
    }, delay);
  }
  let serverNext = 1;
  function acknowledge(nextAttemptIndex: number, status: PlaySessionStatus) {
    serverNext = nextAttemptIndex;
    queue = queue.filter((event) => event.attemptIndex >= nextAttemptIndex);
    sessionStatus = status;
  }
  async function resync() {
    try {
      const view = await transport.sync();
      acknowledge(view.nextAttemptIndex, view.status);
      return true;
    } catch {
      return false;
    }
  }
  async function pump(): Promise<void> {
    if (disposed || inFlight || timer !== undefined) return;
    if (state === "closed" || state === "failed") return;
    if (!queue.length) return settle("idle");
    inFlight = true;
    settle("sending");
    const batch = queue.slice(0, MAX_BATCH);
    try {
      const result = await transport.submit(batch);
      failures = 0;
      acknowledge(result.nextAttemptIndex, result.status);
      inFlight = false;
      if (result.status !== "IN_PROGRESS" && queue.length)
        return settle("closed");
      return pump();
    } catch (value) {
      inFlight = false;
      if (disposed) return;
      const error = errorOf(value);
      if (error.code === "PLAY_SESSION_CLOSED") {
        queue = [];
        return settle("closed");
      }
      if (
        error.code === "INTERACTION_OUT_OF_ORDER" ||
        error.code === "PLAY_SESSION_BUSY"
      ) {
        const synced = await resync();
        if (disposed) return;
        if (sessionStatus !== "IN_PROGRESS" && queue.length) {
          queue = [];
          return settle("closed");
        }
        // The server is missing events this client no longer holds: unrecoverable.
        if (synced && queue.length && queue[0].attemptIndex > serverNext)
          return settle("failed");
        if (synced && failures === 0) {
          failures++;
          return pump();
        }
        return retryLater();
      }
      if (error.status === 0 || error.status === 429 || error.status >= 500)
        return retryLater();
      return settle("failed");
    }
  }

  return {
    push(event: GameInteraction) {
      if (disposed || state === "closed" || state === "failed") return;
      queue.push(event);
      void pump();
    },
    /** Resolves once everything queued is stored, or delivery stopped. */
    flush(): Promise<void> {
      if (!queue.length && !inFlight) return Promise.resolve();
      if (state === "closed" || state === "failed") return Promise.resolve();
      return new Promise((resolve) => {
        waiters.push(resolve);
        if (timer !== undefined) {
          clock.cancel(timer);
          timer = undefined;
        }
        void pump();
      });
    },
    pending: () => [...queue],
    getSnapshot: snapshot,
    dispose() {
      disposed = true;
      if (timer !== undefined) clock.cancel(timer);
      timer = undefined;
      const done = waiters;
      waiters = [];
      done.forEach((resolve) => resolve());
    },
  };
}
export type EventOutbox = ReturnType<typeof createEventOutbox>;
