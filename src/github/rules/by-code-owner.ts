import { EventType } from "../engine/event.js";
import { matchCodeOwners, parseCodeOwners } from "../engine/model/codeowners.js";
import type { RuleContext } from "../engine/model/rule-context.js";
import { on } from "../engine/rule.js";
import type { Effect, Rule } from "../engine/types.js";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_EDITED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ISSUES_OPENED
  | EventType.ISSUES_LABELED
  | EventType.PULL_REQUEST_LABELED
  | EventType.ON_DEMAND;

export function byCodeOwner(config: {
  pathPattern: (integration: string) => string;
  /**
   * Integration domains the item is about — repo policy (file layout, doc
   * links), injected by the manifest. Returning [] skips the rule, including
   * for label events the implementation deems irrelevant.
   */
  domains: (ctx: RuleContext<EventType>) => Promise<string[]>;
}): Rule {
  async function handle(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
    const integrationNames = await config.domains(ctx);
    if (integrationNames.length === 0) return;

    // The rule is only registered on repos that have a CODEOWNERS file, so a
    // missing one is a misconfiguration — surface it instead of no-opping.
    const codeownersContent = await ctx.codeownersContent();
    if (!codeownersContent) {
      throw new Error(`No CODEOWNERS file in ${ctx.repo.fullName}`);
    }

    const entries = parseCodeOwners(codeownersContent);
    const authorLogin = (await ctx.target.authorLogin()).toLowerCase();

    for (const integrationName of integrationNames) {
      const match = matchCodeOwners(config.pathPattern(integrationName), entries);
      if (!match) continue;
      const owners = match.owners.map((o) => o.substring(1).toLowerCase());
      if ((await ctx.expandTeams(owners)).includes(authorLogin)) {
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
