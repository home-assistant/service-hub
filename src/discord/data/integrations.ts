import { fetchWithTimeout } from "../../util/fetch.js";

export interface IntegrationInfo {
  title: string;
  description: string;
  quality_scale?: "no_score" | "silver" | "gold" | "platinum" | "internal";
  iot_class?: string;
  integration_type?: string;
}

export type ReleaseChannel = "stable" | "beta";

type IntegrationIndex = Record<string, IntegrationInfo>;

const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

const cache = new Map<ReleaseChannel, { data: IntegrationIndex; fetchedAt: number }>();

export async function loadIntegrations(
  channel: ReleaseChannel,
  force = false,
): Promise<IntegrationIndex> {
  const cached = cache.get(channel);
  if (cached && !force && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;
  const host = channel === "beta" ? "rc" : "www";
  const response = await fetchWithTimeout(`https://${host}.home-assistant.io/integrations.json`);
  if (!response.ok) throw new Error(`Failed to fetch integrations.json: ${response.status}`);
  const data = (await response.json()) as IntegrationIndex;
  cache.set(channel, { data, fetchedAt: Date.now() });
  return data;
}

export async function getIntegration(
  domain: string,
  channel: ReleaseChannel = "stable",
): Promise<IntegrationInfo | undefined> {
  return (await loadIntegrations(channel))[domain];
}

export function resetIntegrationCache(): void {
  cache.clear();
}
