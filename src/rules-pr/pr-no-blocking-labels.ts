import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Effect, EventPayloadMap, Rule } from "../rules/types.js";

type BlockingEvent =
  | EventType.PULL_REQUEST_LABELED
  | EventType.PULL_REQUEST_UNLABELED
  | EventType.PULL_REQUEST_SYNCHRONIZE;

export function blockingLabels(
  config: Record<string, { message: string; success?: string }>,
): Rule {
  function buildEffects(ctx: WebhookContext<EventPayloadMap[BlockingEvent]>): Effect[] | undefined {
    const payload = ctx.payload;
    const currentLabels = new Set(payload.pull_request.labels.map((l) => l.name));

    // On labeled/unlabeled, only the affected label's status can change.
    // On synchronize, head_sha changed so every configured label must be
    // re-emitted (a missing status leaves required checks in "expected" state).
    const affectedLabel =
      payload.action === "labeled" || payload.action === "unlabeled"
        ? payload.label?.name
        : undefined;

    const labelsToEmit = Object.keys(config).filter((label) => {
      if (payload.action === "synchronize") return true;
      if (affectedLabel && affectedLabel === label) return true;
      return false;
    });

    if (labelsToEmit.length === 0) return;

    return labelsToEmit.map<Effect>((label) => {
      const description = config[label];
      const hasBlockingLabel = currentLabels.has(label);
      return {
        type: "statusCheck",
        sha: payload.pull_request.head.sha,
        context: `blocking-label-${label.toLowerCase().replaceAll(" ", "-")}`,
        state: hasBlockingLabel ? "failure" : "success",
        description: hasBlockingLabel ? description.message : (description.success ?? "OK"),
      };
    });
  }

  return {
    name: "blocking-labels",
    description: `Blocks PRs with labels: ${Object.keys(config).join(", ")}`,
    events: {
      [EventType.PULL_REQUEST_LABELED]: async (ctx) => buildEffects(ctx),
      [EventType.PULL_REQUEST_UNLABELED]: async (ctx) => buildEffects(ctx),
      [EventType.PULL_REQUEST_SYNCHRONIZE]: async (ctx) => buildEffects(ctx),
    },
  };
}
