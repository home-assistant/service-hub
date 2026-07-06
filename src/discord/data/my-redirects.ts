import { fetchWithTimeout } from "../../util/fetch.js";

export interface MyRedirect {
  redirect: string;
  name: string;
  description: string;
  deprecated?: boolean;
  /** Param name → type; a trailing `?` marks the param optional. */
  params?: Record<string, string>;
}

let cache: MyRedirect[] | undefined;

export async function loadMyRedirects(force = false): Promise<MyRedirect[]> {
  if (cache && !force) return cache;
  const response = await fetchWithTimeout(
    "https://raw.githubusercontent.com/home-assistant/my.home-assistant.io/main/redirect.json",
  );
  if (!response.ok) throw new Error(`Failed to fetch redirect.json: ${response.status}`);
  cache = (await response.json()) as MyRedirect[];
  return cache;
}

export async function getMyRedirect(redirect: string): Promise<MyRedirect | undefined> {
  return (await loadMyRedirects()).find((entry) => entry.redirect === redirect);
}

export function resetMyRedirectCache(): void {
  cache = undefined;
}
