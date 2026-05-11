import type { WebhookContext } from "../context/webhook-context.js";
import { upsertDashboardComment } from "../dashboard/comment.js";
import type { DashboardSection } from "../dashboard/types.js";
import { convertPullRequestToDraft } from "../github/client.js";
import { deduplicateByName } from "../utils/deduplicate.js";
import type { Effect, EventPayloadMap, Rule } from "./types.js";

export interface RegistryConfig {
  organizations: Record<string, Rule[]>;
  repositories: Record<string, Rule[]>;
}

export function matchRules(registryConfig: RegistryConfig, context: WebhookContext): Rule[] {
  const orgRules = registryConfig.organizations[context.organization] ?? [];
  const repoRules = registryConfig.repositories[context.repository] ?? [];
  const combined = deduplicateByName([...repoRules, ...orgRules]);

  return combined.filter(
    (rule) =>
      (rule.allowBots !== false || !context.senderIsBot) &&
      Object.hasOwn(rule.events, context.eventType),
  );
}

async function applyEffects(context: WebhookContext, effects: Effect[]): Promise<void> {
  const labels = new Set<string>();
  const removeLabels = new Set<string>();
  const dashboardSections = new Map<string, DashboardSection>();
  const comments: string[] = [];
  const reviewBodies: string[] = [];
  const assignees = new Set<string>();
  const ops: Promise<unknown>[] = [];

  for (const effect of effects) {
    switch (effect.type) {
      case "addLabels":
        for (const l of effect.labels) labels.add(l);
        break;
      case "removeLabel":
        removeLabels.add(effect.label);
        break;
      case "comment":
        comments.push(effect.body);
        break;
      case "requestChanges":
        reviewBodies.push(effect.body);
        break;
      case "addAssignees":
        for (const a of effect.assignees) assignees.add(a);
        break;
      case "dashboardSection":
        dashboardSections.set(effect.section.id, effect.section);
        break;
      case "statusCheck":
        ops.push(
          context.github.repos.createCommitStatus(
            context.repo({
              sha: effect.sha,
              context: effect.context,
              state: effect.state,
              description: effect.description,
            }),
          ),
        );
        break;
      case "crossRepoAddLabels":
        ops.push(
          context.github.issues.addLabels({
            owner: effect.owner,
            repo: effect.repo,
            issue_number: effect.issue_number,
            labels: effect.labels,
          }),
        );
        break;
      case "updatePullRequest":
        ops.push(
          context.github.pulls.update({
            owner: effect.owner,
            repo: effect.repo,
            pull_number: effect.pull_number,
            state: effect.state,
          }),
        );
        break;
      case "convertPullRequestToDraft":
        ops.push(convertPullRequestToDraft(context.github, effect.node_id));
        break;
      case "updateComment":
        ops.push(
          context.github.issues.updateComment(
            context.repo({ comment_id: effect.comment_id, body: effect.body }),
          ),
        );
        break;
      case "requestReviewers":
        ops.push(
          context.github.pulls.requestReviewers(
            context.pullRequest({ reviewers: effect.reviewers }),
          ),
        );
        break;
      case "dismissReview":
        ops.push(
          context.github.pulls.dismissReview(
            context.pullRequest({ review_id: effect.review_id, message: effect.message }),
          ),
        );
        break;
      case "dbExecute":
        ops.push(context.db.execute(effect.sql, ...effect.params));
        break;
    }
  }

  if (labels.size > 0) {
    ops.push(context.github.issues.addLabels(context.issue({ labels: [...labels] })));
  }

  for (const label of removeLabels) {
    if (labels.has(label)) continue;
    ops.push(context.github.issues.removeLabel(context.issue({ name: label })).catch(() => {}));
  }

  if (dashboardSections.size > 0) {
    ops.push(
      upsertDashboardComment(context.github, context.issue(), [...dashboardSections.values()]),
    );
  }

  for (const body of comments) {
    ops.push(context.github.issues.createComment(context.issue({ body })));
  }

  for (const body of reviewBodies) {
    ops.push(
      context.github.pulls.createReview(
        context.pullRequest({ event: "REQUEST_CHANGES" as const, body }),
      ),
    );
  }

  if (assignees.size > 0) {
    ops.push(context.github.issues.addAssignees(context.issue({ assignees: [...assignees] })));
  }

  const settled = await Promise.allSettled(ops);
  for (const outcome of settled) {
    if (outcome.status === "rejected") {
      console.warn("applyEffects operation failed:", outcome.reason);
    }
  }
}

export async function dispatch(
  registryConfig: RegistryConfig,
  context: WebhookContext,
): Promise<void> {
  const matched = matchRules(registryConfig, context);

  const settled = await Promise.allSettled(
    matched.map((rule) => {
      const handler = rule.events[context.eventType as keyof EventPayloadMap];
      if (!handler) return Promise.resolve(undefined);
      // The handler expects WebhookContext<EventPayloadMap[E]>; we know the
      // event type matches because we just looked it up in rule.events.
      return (handler as (ctx: WebhookContext) => Promise<Effect[] | undefined>)(context);
    }),
  );

  const effects: Effect[] = [];
  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    if (outcome.status === "rejected") {
      console.error(`Rule "${matched[i].name}" failed:`, outcome.reason);
    } else if (outcome.value) {
      effects.push(...outcome.value);
    }
  }

  await applyEffects(context, effects);
}
