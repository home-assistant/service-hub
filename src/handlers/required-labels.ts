import type { PullRequestLabeledEvent, PullRequestUnlabeledEvent } from "@octokit/webhooks-types";
import type { WebhookContext } from "../context/webhook-context.js";
import { EventType, HomeAssistantRepository, type Repository } from "../github/types.js";
import type { HandlerResult, WebhookHandler } from "./types.js";

const labelsToCheck: Partial<Record<Repository, string[]>> = {
  [HomeAssistantRepository.CORE]: [
    "breaking-change",
    "bugfix",
    "code-quality",
    "dependency",
    "deprecation",
    "new-feature",
    "new-integration",
  ],
  [HomeAssistantRepository.SUPERVISOR]: [
    "breaking-change",
    "new-feature",
    "bugfix",
    "style",
    "refactor",
    "performance",
    "test",
    "build",
    "ci",
    "chore",
    "revert",
    "dependencies",
  ],
};

export const requiredLabelsHandler: WebhookHandler = {
  name: "required-labels",
  listens: [
    EventType.PULL_REQUEST_LABELED,
    EventType.PULL_REQUEST_UNLABELED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
  ],

  async handle(context: WebhookContext): Promise<HandlerResult | undefined> {
    const payload = context.payload as unknown as
      | PullRequestLabeledEvent
      | PullRequestUnlabeledEvent;
    const currentLabels = new Set(
      payload.pull_request.labels.map((label: { name: string }) => label.name),
    );
    const requiredLabels = labelsToCheck[context.repository];
    if (!requiredLabels) return;

    const hasRequiredLabel = requiredLabels.some((label: string) => currentLabels.has(label));

    return {
      statusCheck: {
        context: "required-labels",
        state: hasRequiredLabel ? "success" : "failure",
        description: hasRequiredLabel
          ? `Has at least one of the required labels (${requiredLabels.join(", ")})`
          : `Missing one of: ${requiredLabels.join(", ")}`,
      },
      dashboard: {
        id: "required-labels",
        title: "Required Labels",
        status: hasRequiredLabel ? "pass" : "fail",
        message: hasRequiredLabel
          ? "Has a required label"
          : `Missing one of: ${requiredLabels.join(", ")}`,
      },
    };
  },
};
