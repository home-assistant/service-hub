import { EventType } from "../engine/event.js";
import type { RuleContext } from "../engine/model/rule-context.js";
import { on } from "../engine/rule.js";
import type { Effect, Rule } from "../engine/types.js";
import { HomeAssistantRepository, homeAssistantOrgRules } from "./home-assistant-org.js";
import type { RepoManifest } from "./types.js";

const LANGUAGE_FILE_RE = /(?:sentences|responses|tests)\/(?<code>[a-z]{2})\/.+\.yaml/;

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.ON_DEMAND;

async function evaluate(ctx: RuleContext<HandledEvent>): Promise<Effect[] | undefined> {
  const labels = new Set<string>();
  for (const file of await ctx.target.files()) {
    const code = LANGUAGE_FILE_RE.exec(file.filename)?.groups?.code;
    if (code) labels.add(`lang: ${code}`);
  }

  if (labels.size === 0) return;
  return [{ type: "addLabels", labels: [...labels] }];
}

const intentsLanguage: Rule = {
  name: "intents-language",
  description: "Labels PRs with `lang: <code>` for every language whose files they touch.",
  allowBots: false,
  events: on(
    [EventType.PULL_REQUEST_OPENED, EventType.PULL_REQUEST_SYNCHRONIZE, EventType.ON_DEMAND],
    evaluate,
  ),
};

export const homeAssistantIntents: RepoManifest = {
  slug: HomeAssistantRepository.INTENTS,
  rules: [intentsLanguage, ...homeAssistantOrgRules],
};
