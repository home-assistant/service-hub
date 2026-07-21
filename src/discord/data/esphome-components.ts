import { fetchWithTimeout } from "../../util/fetch.js";

export interface ComponentInfo {
  title: string;
  url: string;
  path: string;
  image?: string;
}

type ComponentIndex = Record<string, ComponentInfo>;

const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

let cache: { data: ComponentIndex; fetchedAt: number } | undefined;

// The legacy bot had a beta source (beta.esphome.io) selected by channel ID,
// but no channel ever mapped to it — only the stable index is ported.
export async function loadComponents(force = false): Promise<ComponentIndex> {
  if (cache && !force && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.data;
  const response = await fetchWithTimeout("https://esphome.io/components.json");
  if (!response.ok) throw new Error(`Failed to fetch components.json: ${response.status}`);
  const data = (await response.json()) as ComponentIndex;
  cache = { data, fetchedAt: Date.now() };
  return data;
}

export async function getComponent(component: string): Promise<ComponentInfo | undefined> {
  return (await loadComponents())[component];
}

export function resetComponentCache(): void {
  cache = undefined;
}
