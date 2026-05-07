import type { WebhookContext } from "../context/webhook-context.js";
import { EventType, HomeAssistantRepository } from "../github/types.js";
import {
  extractIssuesOrPullRequestMarkdownLinks,
  extractPullRequestURLLinks,
} from "../utils/text-parser.js";
import type { HandlerResult, WebhookHandler } from "./types.js";

export const docsMissingHandler: WebhookHandler = {
  name: "docs-missing",
  listens: [
    EventType.PULL_REQUEST_EDITED,
    EventType.PULL_REQUEST_LABELED,
    EventType.PULL_REQUEST_UNLABELED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
  ],

  async handle(context: WebhookContext): Promise<HandlerResult | undefined> {
    const payload = context.payload as unknown as {
      pull_request: {
        labels: { name: string }[];
        head: { sha: string };
        body: string | null;
        base: { ref: string };
      };
    };

    const isReleasePR = payload.pull_request.base.ref === "master";
    const currentLabels = new Set(payload.pull_request.labels.map((l) => l.name));

    let needsDocumentation = currentLabels.has("docs-missing");

    if (
      !needsDocumentation &&
      (currentLabels.has("new-integration") || currentLabels.has("new-platform"))
    ) {
      const linksToDocs = [
        ...extractIssuesOrPullRequestMarkdownLinks(payload.pull_request.body),
        ...extractPullRequestURLLinks(payload.pull_request.body),
      ].filter(
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
