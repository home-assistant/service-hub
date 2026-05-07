import type { WebhookContext } from "../context/webhook-context.js";
import { upsertDashboardComment } from "../dashboard/comment.js";
import type { DashboardSection } from "../dashboard/types.js";
import { requiredLabelsHandler } from "./required-labels.js";
import type { HandlerResult, WebhookHandler } from "./types.js";

export interface RegistryConfig {
  organizations: Record<string, WebhookHandler[]>;
  repositories: Record<string, WebhookHandler[]>;
}

export const config: RegistryConfig = {
  organizations: {
    // "home-assistant": [validateCla, reviewDrafter],
  },
  repositories: {
    "home-assistant/core": [requiredLabelsHandler],
    // "home-assistant/supervisor": [requiredLabelsHandler],
    // "home-assistant/home-assistant.io": [branchLabels, docsTargetBranch],
    // "esphome/esphome": [],
  },
};

export function matchHandlers(
  registryConfig: RegistryConfig,
  context: WebhookContext,
): WebhookHandler[] {
  const orgHandlers = registryConfig.organizations[context.organization] ?? [];
  const repoHandlers = registryConfig.repositories[context.repository] ?? [];

  const seen = new Set<string>();
  const combined: WebhookHandler[] = [];
  for (const handler of [...repoHandlers, ...orgHandlers]) {
    if (!seen.has(handler.name)) {
      seen.add(handler.name);
      combined.push(handler);
    }
  }

  return combined.filter(
    (handler) =>
      (handler.allowBots !== false || !context.senderIsBot) &&
      handler.listens.includes(context.eventType),
  );
}

async function applyResults(context: WebhookContext, results: HandlerResult[]): Promise<void> {
  const labels = new Set<string>();
  const removeLabels = new Set<string>();
  const dashboardSections = new Map<string, DashboardSection>();
  const comments: string[] = [];
  const assignees = new Set<string>();

  for (const result of results) {
    if (result.labels) {
      for (const l of result.labels) labels.add(l);
    }
    if (result.removeLabels) {
      for (const l of result.removeLabels) removeLabels.add(l);
    }
    if (result.dashboard) {
      dashboardSections.set(result.dashboard.id, result.dashboard);
    }
    if (result.comment) {
      comments.push(result.comment);
    }
    if (result.assignees) {
      for (const a of result.assignees) assignees.add(a);
    }
  }

  const statusChecks = results.flatMap((r) => (r.statusCheck ? [r.statusCheck] : []));
  const reviewRequests = results.flatMap((r) => (r.requestChanges ? [r.requestChanges] : []));
  const actions = results.flatMap((r) => r.actions ?? []);

  const ops: Promise<unknown>[] = [];

  if (labels.size > 0) {
    ops.push(context.github.issues.addLabels(context.issue({ labels: [...labels] })));
  }

  for (const label of removeLabels) {
    if (!labels.has(label)) {
      ops.push(context.github.issues.removeLabel(context.issue({ name: label })).catch(() => {}));
    }
  }

  for (const check of statusChecks) {
    ops.push(
      context.github.repos.createCommitStatus(
        context.repo({
          sha: context.headSha,
          context: check.context,
          state: check.state,
          description: check.description,
        }),
      ),
    );
  }

  if (dashboardSections.size > 0) {
    ops.push(
      upsertDashboardComment(context.github, context.issue(), [...dashboardSections.values()]),
    );
  }

  for (const body of comments) {
    ops.push(context.github.issues.createComment(context.issue({ body })));
  }

  for (const body of reviewRequests) {
    ops.push(
      context.github.pulls.createReview(
        context.pullRequest({ event: "REQUEST_CHANGES" as const, body }),
      ),
    );
  }

  if (assignees.size > 0) {
    ops.push(context.github.issues.addAssignees(context.issue({ assignees: [...assignees] })));
  }

  for (const action of actions) {
    ops.push(action(context));
  }

  await Promise.all(ops);
}

export async function dispatch(
  registryConfig: RegistryConfig,
  context: WebhookContext,
): Promise<void> {
  const matched = matchHandlers(registryConfig, context);

  const settled = await Promise.allSettled(matched.map((h) => h.handle(context)));

  const results: HandlerResult[] = [];
  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    if (outcome.status === "rejected") {
      console.error(`Handler "${matched[i].name}" failed:`, outcome.reason);
    } else if (outcome.value) {
      results.push(outcome.value);
    }
  }

  await applyResults(context, results);
}
