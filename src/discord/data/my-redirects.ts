import { fetchWithTimeout } from "../../util/fetch.js";

export interface MyRedirect {
  redirect: string;
  name: string;
  description: string;
  deprecated?: boolean;
  /** Param name → type; a trailing `?` marks the param optional. */
  params?: Record<string, string>;
}

const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

let cache: { data: MyRedirect[]; fetchedAt: number } | undefined;

export async function loadMyRedirects(force = false): Promise<MyRedirect[]> {
  if (cache && !force && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.data;
  const response = await fetchWithTimeout(
    "https://raw.githubusercontent.com/home-assistant/my.home-assistant.io/main/redirect.json",
  );
  if (!response.ok) throw new Error(`Failed to fetch redirect.json: ${response.status}`);
  const data = (await response.json()) as MyRedirect[];
  cache = { data, fetchedAt: Date.now() };
  return data;
}

export async function getMyRedirect(redirect: string): Promise<MyRedirect | undefined> {
  return (await loadMyRedirects()).find((entry) => entry.redirect === redirect);
}

export function resetMyRedirectCache(): void {
  cache = undefined;
}
