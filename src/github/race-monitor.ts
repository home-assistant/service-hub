import { log } from "../log.js";

interface InFlight {
  eventType: string;
  startedAt: number;
}

const inFlight = new Map<string, InFlight[]>();

/**
 * Track a dispatch's lifetime; logs to Sentry when it overlaps another
 * dispatch for the same item. Overlap is an upper bound on lost-update races:
 * it only corrupts state if both dispatches write. Removal is deferred so the
 * window stays open while GitHub applies the emitted effects.
 */
export async function logRace<T>(
  key: string,
  eventType: string,
  run: () => Promise<T>,
): Promise<T> {
  const entry: InFlight = { eventType, startedAt: Date.now() };
  const running = inFlight.get(key) ?? [];

  if (running.length > 0) {
    log.warn("dispatch overlap", {
      key,
      eventType,
      concurrent: running.length + 1,
      runningEvents: running.map((r) => r.eventType),
      oldestRunningMs: Date.now() - running[0].startedAt,
    });
  }

  running.push(entry);
  inFlight.set(key, running);
  try {
    return await run();
  } finally {
    setTimeout(() => {
      const list = inFlight.get(key) ?? [];
      const idx = list.indexOf(entry);
      if (idx !== -1) list.splice(idx, 1);
      if (list.length === 0) inFlight.delete(key);
    }, 100);
  }
}
