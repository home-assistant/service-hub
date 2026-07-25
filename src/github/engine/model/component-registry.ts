import { log } from "../../../log.js";
import { fetchWithTimeout } from "../../../util/fetch.js";

// Source of truth: home-assistant:core/homeassistant/generated/entity_platforms.py
const ENTITY_PLATFORMS_URL =
  "https://raw.githubusercontent.com/home-assistant/core/dev/homeassistant/generated/entity_platforms.py";

// Entity platforms change rarely; refresh at most once per day.
const REFRESH_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Cross-event cache for the fetched entity-platform list (the set changes
 * rarely; one long-lived process, so entries span deliveries).
 */
let cache: { platforms: Set<string>; fetchedAt: number } | undefined;
let inflight: Promise<Set<string>> | undefined;

/** Extract the `"platform"` string literals from core's generated enum file. */
function parseEntityPlatforms(source: string): Set<string> {
  const platforms = new Set<string>();
  for (const [, name] of source.matchAll(/=\s*"([a-z0-9_]+)"/g)) platforms.add(name);
  return platforms;
}

async function fetchEntityPlatforms(): Promise<Set<string>> {
  try {
    const res = await fetchWithTimeout(ENTITY_PLATFORMS_URL);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const parsed = parseEntityPlatforms(await res.text());
    if (parsed.size === 0) throw new Error("no platforms parsed");
    cache = { platforms: parsed, fetchedAt: Date.now() };
    return parsed;
  } catch (err) {
    log.warn("component-registry: entity platform fetch failed", { error: String(err) });
    return cache?.platforms ?? new Set<string>();
  }
}

/**
 * Home Assistant entity platforms, fetched from core and cached for a day.
 * Empty until the first successful fetch; last-good on later failures.
 */
export function getEntityPlatforms(): Promise<Set<string>> {
  if (cache && Date.now() - cache.fetchedAt < REFRESH_TTL_MS) {
    return Promise.resolve(cache.platforms);
  }
  if (!inflight) {
    inflight = fetchEntityPlatforms().finally(() => {
      inflight = undefined;
    });
  }
  return inflight;
}

/** Test hook: seed the cache so tests don't hit the network. */
export function seedEntityPlatforms(platforms: Iterable<string>): void {
  cache = { platforms: new Set(platforms), fetchedAt: Date.now() };
  inflight = undefined;
}

/** Test hook: drop the cache. */
export function resetComponentRegistry(): void {
  cache = undefined;
  inflight = undefined;
}
