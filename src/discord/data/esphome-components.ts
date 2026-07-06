import { fetchWithTimeout } from "../../util/fetch.js";

export interface ComponentInfo {
  title: string;
  url: string;
  path: string;
  image?: string;
}

type ComponentIndex = Record<string, ComponentInfo>;

let cache: ComponentIndex | undefined;

// The legacy bot had a beta source (beta.esphome.io) selected by channel ID,
// but no channel ever mapped to it — only the stable index is ported.
export async function loadComponents(force = false): Promise<ComponentIndex> {
  if (cache && !force) return cache;
  const response = await fetchWithTimeout("https://esphome.io/components.json");
  if (!response.ok) throw new Error(`Failed to fetch components.json: ${response.status}`);
  cache = (await response.json()) as ComponentIndex;
  return cache;
}

export async function getComponent(component: string): Promise<ComponentInfo | undefined> {
  return (await loadComponents())[component];
}

export function resetComponentCache(): void {
  cache = undefined;
}
