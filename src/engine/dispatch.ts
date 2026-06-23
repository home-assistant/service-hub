import { convertPullRequestToDraft } from "../github/client.js";
import { EventType } from "../github/types.js";
import { type WebhookContext, WebhookContextType } from "./context.js";
import { ensureDashboardCommentExists, upsertDashboardComment } from "./dashboard/comment.js";
import { parseOverrides } from "./dashboard/overrides.js";
import type { DashboardSection } from "./dashboard/types.js";
import type { Effect, EventPayloadMap, Rule } from "./types.js";

export interface RegistryConfig {
  repositories: Record<string, Rule[]>;
}

export function matchRules(registryConfig: RegistryConfig, context: WebhookContext): Rule[] {
  const repoRules = registryConfig.repositories[context.repository] ?? [];

  return repoRules.filter(
    (rule) =>
      (rule.allowBots !== false || !context.senderIsBot) &&
      Object.hasOwn(rule.events, context.eventType),
  );
}

/** Collect every dashboardSection ID claimed by some rule in this repo's registry. */
function collectKnownDashboardSectionIds(
  registryConfig: RegistryConfig,
  context: WebhookContext,
): Set<string> {
  const ids = new Set<string>();
  const rules = registryConfig.repositories[context.repository] ?? [];
  for (const rule of rules) {
    if (rule.dashboardSections) for (const id of rule.dashboardSections) ids.add(id);
  }
  return ids;
}

interface ApplyEffectsConfig {
  knownSectionIds: ReadonlySet<string>;
}

async function applyEffects(
  context: WebhookContext,
  effects: Effect[],
  config: ApplyEffectsConfig,
): Promise<void> {
  if (context.dryRun) {
    console.log(
      JSON.stringify({
        dryRun: true,
        repository: context.repository,
        eventType: context.eventType,
        number: tryNumber(context),
        effects,
      }),
    );
    return;
  }

  const labels = new Set<string>();
  const removeLabels = new Set<string>();
  const dashboardSections = new Map<string, DashboardSection>();
  const assignees = new Set<string>();
  const comments: string[] = [];
  const ops: Promise<unknown>[] = [];

  for (const effect of effects) {
    switch (effect.type) {
      case "addLabels":
        for (const l of effect.labels) labels.add(l);
        break;
      case "removeLabels":
        for (const l of effect.label) removeLabels.add(l);
        break;
      case "addAssignees":
        for (const a of effect.assignees) assignees.add(a);
        break;
      case "comment":
        comments.push(effect.body);
        break;
      case "dashboardSection":
        dashboardSections.set(effect.section.id, effect.section);
        break;
      case "addLabelsCrossRepo":
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
      case "requestReviewers":
        ops.push(
          context.github.pulls.requestReviewers(
            context.pullRequest({ reviewers: effect.reviewers }),
          ),
        );
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
    // Post a placeholder dashboard *before* the other effects race, so the
    // dashboard is always the earliest comment on the PR. The real content
    // gets rendered by syncDashboardAndStatus below (which updates this
    // placeholder via findDashboardCommentId).
    await ensureDashboardCommentExists(context.github, context.issue());
    ops.push(syncDashboardAndStatus(context, [...dashboardSections.values()], config));
  }

  for (const body of comments) {
    ops.push(context.github.issues.createComment(context.issue({ body })));
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

function tryNumber(context: WebhookContext): number | undefined {
  try {
    return context.number;
  } catch {
    return undefined;
  }
}

const HA_BOT_STATUS_CONTEXT = "ha-bot";

/** Convert the PR to draft unless it's already one */
async function draftPRIfNotDraft(context: WebhookContext): Promise<void> {
  if (context.type !== WebhookContextType.PULL_REQUEST) return;
  try {
    const pr = await context.fetchPullRequestWithCache(context.pullRequest());
    if (pr.draft) return;
    await convertPullRequestToDraft(context.github, pr.node_id);
  } catch (err) {
    console.warn("draftPRIfNotDraft failed:", err);
  }
}

/** Re-draft if the existing ha-bot aggregate on head SHA is failing. */
async function maybeRedraftOnReady(context: WebhookContext): Promise<void> {
  if (!context.headSha) return;
  try {
    const { data: statuses } = await context.github.repos.listCommitStatusesForRef(
      context.repo({ ref: context.headSha, per_page: 100 }),
    );
    const haBot = statuses.find((s) => s.context === HA_BOT_STATUS_CONTEXT);
    if (haBot?.state !== "failure") return;
    await draftPRIfNotDraft(context);
  } catch (err) {
    console.warn("maybeRedraftOnReady failed:", err);
  }
}

function aggregateDashboardStatus(sections: DashboardSection[]): {
  state: "success" | "failure" | "pending";
  description: string;
} {
  const fails = sections.filter((s) => s.status === "fail").length;
  const pending = sections.filter((s) => s.status === "pending").length;
  const skipped = sections.filter((s) => s.status === "skip").length;
  if (pending > 0) {
    return { state: "pending", description: `${pending} check${pending === 1 ? "" : "s"} pending` };
  }
  if (fails > 0) {
    return { state: "failure", description: `${fails} check${fails === 1 ? "" : "s"} failing` };
  }
  return {
    state: "success",
    description: skipped > 0 ? `All checks passed (${skipped} skipped)` : "All checks passed",
  };
}

/**
 * Upsert the dashboard comment, then write a single aggregate `ha-bot` commit
 * status whose target_url deep-links to the comment. Sequential — we need the
 * comment URL before posting the status. Rules emit `dashboardSection` effects;
 * the status check is synthesized here so individual rules don't have to.
 *
 * Also sweeps stale dashboard sections and stale commit statuses written by
 * older deploys (any IDs/contexts no live rule claims).
 */
async function syncDashboardAndStatus(
  context: WebhookContext,
  newSections: DashboardSection[],
  config: ApplyEffectsConfig,
): Promise<void> {
  const overrides = parseOverrides(await context.getBody());
  const result = await upsertDashboardComment(
    context.github,
    context.issue(),
    newSections,
    config.knownSectionIds,
    overrides,
  );
  if (!result) return;
  if (!context.headSha) return;

  const aggregate = aggregateDashboardStatus(result.sections);
  // Sweep stale status checks (best-effort; failures here shouldn't sink the
  // primary write below). The bot writes only the `ha-bot` aggregate going
  // forward — anything else we created on this commit is from an older deploy.
  const sweep = sweepStaleStatusChecks(context).catch((err) => {
    console.warn("sweepStaleStatusChecks failed:", err);
  });
  await context.github.repos.createCommitStatus(
    context.repo({
      sha: context.headSha,
      context: HA_BOT_STATUS_CONTEXT,
      state: aggregate.state,
      description: aggregate.description,
      target_url: result.comment.url,
    }),
  );
  if (aggregate.state === "failure") {
    await draftPRIfNotDraft(context);
  }
  await sweep;
}

/**
 * Find commit statuses on the head SHA that *we* wrote (matched by creator
 * login = `<botSlug>[bot]`) whose context isn't the dispatcher's aggregate
 * `ha-bot` context, and neutralize them to `success` + "No longer in use".
 * GitHub has no "delete status" API; overwriting is the closest equivalent.
 *
 * Rules write only `dashboardSection` effects going forward; the single
 * `ha-bot` status is the bot's sole commit-status output. Any other context
 * we own on this commit is therefore from an older deploy.
 */
async function sweepStaleStatusChecks(context: WebhookContext): Promise<void> {
  if (!context.headSha) return;
  const { data: statuses } = await context.github.repos.listCommitStatusesForRef(
    context.repo({ ref: context.headSha, per_page: 100 }),
  );
  // Collapse to the latest status per context (API returns newest first).
  const latestByContext = new Map<string, (typeof statuses)[number]>();
  for (const s of statuses) {
    if (!latestByContext.has(s.context)) latestByContext.set(s.context, s);
  }

  const ourLogin = context.botLogin.toLowerCase();
  const stale = [...latestByContext.values()].filter(
    (s) =>
      s.creator?.login?.toLowerCase() === ourLogin &&
      s.context !== HA_BOT_STATUS_CONTEXT &&
      s.state !== "success",
  );
  if (stale.length === 0) return;
  console.log(
    `[sweep] neutralizing ${stale.length} stale status${stale.length === 1 ? "" : "es"}:`,
    stale.map((s) => s.context).join(", "),
  );
  await Promise.all(
    stale.map((s) =>
      context.github.repos
        .createCommitStatus(
          context.repo({
            sha: context.headSha,
            context: s.context,
            state: "success" as const,
            description: "No longer in use",
          }),
        )
        .catch((err) => {
          console.warn(`[sweep] failed to neutralize ${s.context}:`, err);
        }),
    ),
  );
}

export async function dispatch(
  registryConfig: RegistryConfig,
  context: WebhookContext,
): Promise<Effect[]> {
  if (context.eventType === EventType.PULL_REQUEST_READY_FOR_REVIEW && !context.dryRun) {
    await maybeRedraftOnReady(context);
  }

  const matched = matchRules(registryConfig, context);

  const settled = await Promise.allSettled(
    matched.map((rule) => {
      const handler = rule.events[context.eventType as keyof EventPayloadMap];
      if (!handler) return Promise.resolve(undefined);
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

  await applyEffects(context, effects, {
    knownSectionIds: collectKnownDashboardSectionIds(registryConfig, context),
  });
  return effects;
}
