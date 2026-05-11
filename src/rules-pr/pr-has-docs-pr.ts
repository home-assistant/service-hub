import type { PullRequestEditedEvent, PullRequestLabeledEvent } from "@octokit/webhooks-types";
import type { WebhookContext } from "../context/webhook-context.js";
import { EventType, HomeAssistantRepository } from "../github/types.js";
import type { Rule, RuleResult } from "../rules/types.js";
import { extractAllLinks } from "../utils/text-parser.js";

export const prHasDocsPr: Rule = {
  name: "docs-missing",
  description: "Checks new integrations and platforms have a linked documentation PR",
  listens: [
    EventType.PULL_REQUEST_EDITED,
    EventType.PULL_REQUEST_LABELED,
    EventType.PULL_REQUEST_UNLABELED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
  ],

  async handle(context: WebhookContext): Promise<RuleResult | undefined> {
    const payload = context.payload as PullRequestEditedEvent | PullRequestLabeledEvent;

    const isReleasePR = payload.pull_request.base.ref === "master";
    const currentLabels = new Set(payload.pull_request.labels.map((l) => l.name));

    let needsDocumentation = currentLabels.has("docs-missing");

    if (
      !needsDocumentation &&
      (currentLabels.has("new-integration") || currentLabels.has("new-platform"))
    ) {
      const linksToDocs = extractAllLinks(payload.pull_request.body).filter(
        (link) => `${link.owner}/${link.repo}` === HomeAssistantRepository.HOME_ASSISTANT_IO,
      );

      needsDocumentation = linksToDocs.length === 0;
    }

    const ok = isReleasePR || !needsDocumentation;

    return {
      statusCheck: {
        context: "docs-missing",
        state: ok ? "success" : "failure",
        description: isReleasePR
          ? "Documentation check auto-approved for release PR."
          : needsDocumentation
            ? "Please open a documentation PR."
            : "Documentation ok.",
      },
      dashboard: {
        id: "docs-missing",
        title: "Documentation",
        status: ok ? "pass" : "fail",
        message: isReleasePR
          ? "Auto-approved for release PR"
          : needsDocumentation
            ? "Missing documentation PR"
            : "Documentation PR linked",
      },
    };
  },
};
