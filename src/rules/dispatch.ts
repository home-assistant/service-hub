import { WebhookContextType, type WebhookContext } from "../context/webhook-context.js";
import { upsertDashboardComment } from "../dashboard/comment.js";
import type { DashboardSection } from "../dashboard/types.js";
import { deduplicateByName } from "../utils/deduplicate.js";
import { parseOverrides } from "../utils/rule-overrides.js";
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

/**
 * Collect every dashboardSection ID claimed by some rule in this repo/org's
 * registry. Used to sweep stale sections written by older deploys.
 */
function collectKnownDashboardSectionIds(
  registryConfig: RegistryConfig,
  context: WebhookContext,
): Set<string> {
  const ids = new Set<string>();
  const rules = [
    ...(registryConfig.repositories[context.repository] ?? []),
    ...(registryConfig.organizations[context.organization] ?? []),
  ];
  for (const rule of rules) {
    if (rule.dashboardSections) for (const id of rule.dashboardSections) ids.add(id);
  }
  return ids;
}

interface ApplyEffectsConfig {
  knownSectionIds: ReadonlySet<string>;
}

/**
 * Returns the body of the issue or PR in scope — the surface where users
 * declare rule overrides via `<!-- ha-bot:ignore ... -->` tags. Tries the
 * webhook payload first (every PR_* and ISSUES_* event carries it inline);
 * for shapes that don't (e.g. `issue_comment` on a PR has the body on
 * `issue.body`, not `pull_request.body`) falls back to a cached fetch via
 * the endpoint matching `context.type`.
 */
async function getOverrideSourceBody(context: WebhookContext): Promise<string | null> {
  const payload = context.payload as {
    pull_request?: { body?: string | null };
    issue?: { body?: string | null };
  };

  if (payload.pull_request?.body != null) return payload.pull_request.body;
  if (payload.issue?.body != null) return payload.issue.body;

  try {
    if (context.type === WebhookContextType.PULL_REQUEST) {
      const pr = await context.fetchPullRequestWithCache(context.pullRequest());
      return pr.body ?? null;
    }
    const issue = await context.fetchIssueWithCache(context.issue());
    return issue.body ?? null;
  } catch (err) {
    console.warn("getOverrideSourceBody fetch failed:", err);
    return null;
  }
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
  const overrides = parseOverrides(await getOverrideSourceBody(context));
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
