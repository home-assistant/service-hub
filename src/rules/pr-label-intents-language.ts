import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Rule, RuleResult } from "./types.js";

const LANGUAGE_FILE_REGEX =
  /(?:sentences|responses|tests)\/(?<language_code>[a-z]{2})\/(?:.+)\.yaml/;

export const prLabelIntentsLanguage: Rule = {
  name: "pr-label-intents-language",
  allowBots: false,
  listens: [EventType.PULL_REQUEST_OPENED, EventType.PULL_REQUEST_SYNCHRONIZE],

  async handle(context: WebhookContext): Promise<RuleResult | undefined> {
    const files = await context.fetchPRFiles();
    const langs = new Set<string>();

    for (const file of files) {
      const match = LANGUAGE_FILE_REGEX.exec(file.filename);
      if (match?.groups?.language_code) {
        langs.add(`lang: ${match.groups.language_code}`);
      }
    }

    if (langs.size > 0) {
      return { labels: [...langs] };
    }
  },
};
