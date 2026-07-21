import { resetComponentCache } from "../../../src/discord/data/esphome-components.js";
import { resetIntegrationCache } from "../../../src/discord/data/integrations.js";
import { resetMessageCache } from "../../../src/discord/data/messages.js";
import { resetMyRedirectCache } from "../../../src/discord/data/my-redirects.js";

/**
 * URL substring → response body served by the fetch mock; other URLs 404.
 * String bodies serve as text (YAML files), everything else as JSON —
 * same contract as the GitHub fixture harness, plus text support.
 */
export function routeFetch(remote: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [pattern, body] of Object.entries(remote)) {
      if (url.includes(pattern)) {
        return {
          ok: true,
          status: 200,
          json: async () => (typeof body === "string" ? JSON.parse(body) : body),
          text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
        } as Response;
      }
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => "" } as Response;
  }) as typeof fetch;
}

/** Data-service caches survive across tests unless dropped. */
export function resetDataCaches(): void {
  resetMessageCache();
  resetIntegrationCache();
  resetMyRedirectCache();
  resetComponentCache();
}

/** Swap globalThis.fetch for the duration of `run`. */
export async function withRemote<T>(
  remote: Record<string, unknown>,
  run: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = routeFetch(remote);
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}
