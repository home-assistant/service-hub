import type { EventType } from "../../../engine/event.js";
import type { ListPullRequestFiles } from "../../../engine/model/pull-request.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import { extractIntegrationDocumentationLinks } from "../../../helpers/ha-links.js";
import { fetchIntegrationManifest } from "./integration-manifest.js";
import { ParsedPath } from "./parse-path.js";

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

/** Unique integration domains derived from a PR's changed file paths. */
export function domainsFromFiles(files: ListPullRequestFiles): string[] {
  const domains = new Set<string>();
  for (const file of files) {
    const parsed = new ParsedPath(file);
    if (parsed.component) domains.add(parsed.component);
  }
  return [...domains];
}

/**
 * Every integration domain the item is about, derived from the item itself:
 * changed files for PRs, documentation links in the body for issues — unioned
 * with any `integration:` labels already present (maintainer adds, earlier
 * dispatches). Rules use this instead of waiting for another rule's labels.
 */
export async function itemIntegrationDomains(ctx: RuleContext<EventType>): Promise<string[]> {
  const labeled = domainsFromLabels(await ctx.target.labels());

  let derived: string[];
  if (ctx.target.kind === "pull_request") {
    const fromFiles = domainsFromFiles(await ctx.target.files());
    derived = fromFiles.length > MAX_INTEGRATION_LABELS ? [] : fromFiles;
  } else {
    derived = await domainsFromIssueBody(await ctx.target.body());
  }

  return [...new Set([...labeled, ...derived])];
}

/**
 * `itemIntegrationDomains` gated for label events: a labeled/unlabeled event
 * for a non-`integration:` label yields nothing, so rules skip work the event
 * can't have changed. Injected into the shared code-owner rule factories.
 */
export async function integrationDomainsFromEvent(ctx: RuleContext<EventType>): Promise<string[]> {
  if ("label" in ctx.event && !ctx.event.label.startsWith(INTEGRATION_LABEL_PREFIX)) return [];
  return itemIntegrationDomains(ctx);
}
