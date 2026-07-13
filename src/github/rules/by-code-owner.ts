import { EventType } from "../engine/event.js";
import { matchCodeOwners, parseCodeOwners } from "../engine/model/codeowners.js";
import { on } from "../engine/rule.js";
import type { RuleContext } from "../engine/rule-context.js";
import type { Effect, Rule } from "../engine/types.js";
import { INTEGRATION_LABEL_PREFIX, itemIntegrationDomains } from "./integrations.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ISSUES_OPENED
  | EventType.ISSUES_LABELED
  | EventType.PULL_REQUEST_LABELED
  | EventType.ON_DEMAND;

export function byCodeOwner(config: { pathPattern: (integration: string) => string }): Rule {
  async function handle(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
    if ("label" in ctx.event && !ctx.event.label.startsWith(INTEGRATION_LABEL_PREFIX)) return;

    const integrationNames = await itemIntegrationDomains(ctx);
    if (integrationNames.length === 0) return;

    // The rule is only registered on repos that have a CODEOWNERS file, so a
    // missing one is a misconfiguration — surface it instead of no-opping.
    const codeownersContent = await ctx.repo.codeownersContent();
    if (!codeownersContent) {
      throw new Error(`No CODEOWNERS file in ${ctx.repository}`);
    }

    const entries = parseCodeOwners(codeownersContent);
    const authorLogin = (await ctx.target.authorLogin()).toLowerCase();

    for (const integrationName of integrationNames) {
      const match = matchCodeOwners(config.pathPattern(integrationName), entries);
      if (!match) continue;
      const owners = match.owners.map((o) => o.substring(1).toLowerCase());
      if ((await ctx.org.expandTeams(owners)).includes(authorLogin)) {
        return [{ type: "addLabels", labels: ["by-code-owner"] }];
      }
    }
  }

  return {
    name: "by-code-owner",
    description: "Labels PRs/issues authored by a code owner of a touched integration",
    events: on(
      [
        EventType.PULL_REQUEST_OPENED,
        EventType.PULL_REQUEST_EDITED,
        EventType.PULL_REQUEST_SYNCHRONIZE,
        EventType.ISSUES_OPENED,
        EventType.ISSUES_LABELED,
        EventType.PULL_REQUEST_LABELED,
        EventType.ON_DEMAND,
      ],
      handle,
    ),
  };
}
