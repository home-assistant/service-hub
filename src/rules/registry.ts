import type { WebhookContext } from "../context/webhook-context.js";
import { upsertDashboardComment } from "../dashboard/comment.js";
import type { DashboardSection } from "../dashboard/types.js";
import { prClaSigned } from "./pr-cla-signed.js";
import { prCleanupLabelsOnClose } from "./pr-cleanup-labels-on-close.js";
import { prDraftOnChangesRequested } from "./pr-draft-on-changes-requested.js";
import { prHasDocsPr } from "./pr-has-docs-pr.js";
import { prHasTypeLabel } from "./pr-has-type-label.js";
import { prNoBlockingLabels } from "./pr-no-blocking-labels.js";
import type { Rule, RuleResult } from "./types.js";

export interface RegistryConfig {
  organizations: Record<string, Rule[]>;
  repositories: Record<string, Rule[]>;
}

export const config: RegistryConfig = {
  organizations: {
    "home-assistant": [prClaSigned, prDraftOnChangesRequested],
    esphome: [prDraftOnChangesRequested],
  },
  repositories: {
    "home-assistant/core": [
      prHasTypeLabel,
      prNoBlockingLabels,
      prHasDocsPr,
      prCleanupLabelsOnClose,
    ],
    "home-assistant/supervisor": [prHasTypeLabel],
    "home-assistant/frontend": [prNoBlockingLabels],
    "home-assistant/home-assistant.io": [prCleanupLabelsOnClose],
  },
};

export function matchRules(registryConfig: RegistryConfig, context: WebhookContext): Rule[] {
  const orgRules = registryConfig.organizations[context.organization] ?? [];
  const repoRules = registryConfig.repositories[context.repository] ?? [];

  const seen = new Set<string>();
  const combined: Rule[] = [];
  for (const rule of [...repoRules, ...orgRules]) {
    if (!seen.has(rule.name)) {
      seen.add(rule.name);
      combined.push(rule);
    }
  }

  return combined.filter(
    (rule) =>
      (rule.allowBots !== false || !context.senderIsBot) &&
      rule.listens.includes(context.eventType),
  );
}

async function applyResults(context: WebhookContext, results: RuleResult[]): Promise<void> {
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
  const matched = matchRules(registryConfig, context);

  const settled = await Promise.allSettled(matched.map((r) => r.handle(context)));

  const results: RuleResult[] = [];
  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    if (outcome.status === "rejected") {
      console.error(`Rule "${matched[i].name}" failed:`, outcome.reason);
    } else if (outcome.value) {
      results.push(outcome.value);
    }
  }

  await applyResults(context, results);
}
