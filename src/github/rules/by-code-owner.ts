import { EventType } from "../engine/event.js";
import { matchCodeOwners, parseCodeOwners } from "../engine/model/codeowners.js";
import { on } from "../engine/rule.js";
import type { RuleContext } from "../engine/rule-context.js";
import type { Effect, Rule } from "../engine/types.js";

type HandledEvent = EventType.ISSUES_LABELED | EventType.PULL_REQUEST_LABELED | EventType.ON_DEMAND;

const INTEGRATION_LABEL_PREFIX = "integration: ";

export function byCodeOwner(config: { pathPattern: (integration: string) => string }): Rule {
  async function handle(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
    if ("label" in ctx.event && !ctx.event.label.startsWith(INTEGRATION_LABEL_PREFIX)) return;

    const integrationNames = (await ctx.target.labels())
      .filter((l) => l.startsWith(INTEGRATION_LABEL_PREFIX))
      .map((l) => l.slice(INTEGRATION_LABEL_PREFIX.length));
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
    description: "Labels PRs/issues authored by a code owner of a labeled integration",
    events: on(
      [EventType.ISSUES_LABELED, EventType.PULL_REQUEST_LABELED, EventType.ON_DEMAND],
      handle,
    ),
  };
}
