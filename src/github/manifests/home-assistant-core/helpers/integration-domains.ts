import type { EventType } from "../../../engine/event.js";
import type { ListPullRequestFiles } from "../../../engine/model/pull-request.js";
import type { RuleContext } from "../../../engine/model/rule-context.js";
import {
  domainsFromIssueBody,
  domainsFromLabels,
  INTEGRATION_LABEL_PREFIX,
  MAX_INTEGRATION_LABELS,
} from "../../../helpers/integration-domains.js";
import { ParsedPath } from "./parse-path.js";

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
