import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Effect, EventPayloadMap, Rule } from "../rules/types.js";

const LANGUAGE_FILE_REGEX =
  /(?:sentences|responses|tests)\/(?<language_code>[a-z]{2})\/(?:.+)\.yaml/;

async function evaluate(
  ctx: WebhookContext<
    | EventPayloadMap[EventType.PULL_REQUEST_OPENED]
    | EventPayloadMap[EventType.PULL_REQUEST_SYNCHRONIZE]
  >,
): Promise<Effect[] | undefined> {
  const files = await ctx.fetchPRFiles();
  const langs = new Set<string>();

  for (const file of files) {
    const match = LANGUAGE_FILE_REGEX.exec(file.filename);
    if (match?.groups?.language_code) {
      langs.add(`lang: ${match.groups.language_code}`);
    }
  }

  if (langs.size > 0) {
    return [{ type: "addLabels", labels: [...langs] }];
  }
}

export const prLabelIntentsLanguage: Rule = {
  name: "pr-label-intents-language",
  description: "Labels intent PRs with the language codes of modified files",
  allowBots: false,
  events: {
    [EventType.PULL_REQUEST_OPENED]: evaluate,
    [EventType.PULL_REQUEST_SYNCHRONIZE]: evaluate,
  },
};
