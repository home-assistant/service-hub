import { extractIntegrationDocumentationLinks } from "./ha-links.js";
import { fetchIntegrationManifest } from "./integration-manifest.js";

export const INTEGRATION_LABEL_PREFIX = "integration: ";

/**
 * Cap on how many integrations an item is treated as being "about". A PR
 * touching more than this many integrations is almost always a tree-wide
 * change, where per-integration handling is noise.
 */
export const MAX_INTEGRATION_LABELS = 5;

/** Domains named by `integration: <domain>` labels currently on the item. */
export function domainsFromLabels(labels: readonly string[]): string[] {
  return labels
    .filter((l) => l.startsWith(INTEGRATION_LABEL_PREFIX))
    .map((l) => l.slice(INTEGRATION_LABEL_PREFIX.length));
}

/**
 * Integration domains an issue body names via documentation links
 * (`https://www.home-assistant.io/integrations/...`). Platform-page links
 * (`/integrations/binary_sensor.template`) name the integration in the
 * platform segment; plain pages in the integration one. A manifest fetch
 * doubles as validation, so typos and custom-integration links don't count.
 */
export async function domainsFromIssueBody(body: string | null): Promise<string[]> {
  const links = extractIntegrationDocumentationLinks(body);
  const candidates = [...new Set(links.map((l) => l.platform ?? l.integration))].slice(
    0,
    MAX_INTEGRATION_LABELS,
  );

  const domains: string[] = [];
  for (const domain of candidates) {
    if (await fetchIntegrationManifest(domain)) domains.push(domain);
  }
  return domains;
}
