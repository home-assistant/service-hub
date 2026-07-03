import { convertPullRequestToDraft } from "../github/client.js";
import { EventType } from "../github/types.js";
import { type WebhookContext, WebhookContextType, type WebhookEventPayload } from "./context.js";
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
  // Set: the label loop can run a rule twice per dispatch; identical comments post once.
  const comments = new Set<string>();
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
        comments.add(effect.body);
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

async function runMatchedRules(
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
  return effects;
}

/** Synthetic rounds before the label loop declares the rule set non-converging. */
const MAX_LABEL_ROUNDS = 10;

interface LabelLike {
  name: string;
}

function payloadLabels(context: WebhookContext): LabelLike[] | undefined {
  const payload = context.payload as {
    pull_request?: { labels?: LabelLike[] };
    issue?: { labels?: LabelLike[] };
  };
  return payload.pull_request?.labels ?? payload.issue?.labels;
}

/**
 * Label adds/removes against the simulated set. Add wins over remove within
 * a round (mirrors applyEffects); cross-repo label effects don't participate.
 */
function labelChanges(
  effects: Effect[],
  current: ReadonlySet<string>,
): { adds: string[]; removes: string[] } {
  const added = new Set<string>();
  const removed = new Set<string>();
  for (const effect of effects) {
    if (effect.type === "addLabels") for (const l of effect.labels) added.add(l);
    else if (effect.type === "removeLabels") for (const l of effect.label) removed.add(l);
  }
  return {
    adds: [...added].filter((l) => !current.has(l)),
    removes: [...removed].filter((l) => current.has(l) && !added.has(l)),
  };
}

/**
 * Context for a synthetic labeled/unlabeled event, shaped like the webhook
 * GitHub would send after the change. Undefined when no matching EventType
 * exists (issue unlabels) or the PR can't be fetched.
 */
async function buildSyntheticLabelContext(
  context: WebhookContext,
  change: { name: string; action: "labeled" | "unlabeled" },
  labels: LabelLike[],
): Promise<WebhookContext | undefined> {
  const base = context.payload as unknown as Record<string, unknown> & {
    pull_request?: object;
    issue?: object;
  };
  const label = { name: change.name };

  if (context.type === WebhookContextType.PULL_REQUEST) {
    // issue_comment events on a PR carry no pull_request object; fetch it.
    let pr = base.pull_request;
    if (!pr) {
      try {
        pr = await context.fetchPullRequestWithCache(context.pullRequest());
      } catch (err) {
        console.warn("label loop: failed to fetch PR for synthetic event:", err);
        return undefined;
      }
    }
    const payload = {
      ...base,
      action: change.action,
      label,
      pull_request: { ...pr, labels },
    } as unknown as WebhookEventPayload;
    return context.withSyntheticEvent(
      payload,
      change.action === "labeled"
        ? EventType.PULL_REQUEST_LABELED
        : EventType.PULL_REQUEST_UNLABELED,
    );
  }

  // Issues have no unlabeled EventType; removals only count toward the net diff.
  if (change.action !== "labeled" || !base.issue) return undefined;
  const payload = {
    ...base,
    action: "labeled",
    label,
    issue: { ...base.issue, labels },
  } as unknown as WebhookEventPayload;
  return context.withSyntheticEvent(payload, EventType.ISSUES_LABELED);
}

/**
 * The label loop: simulates label effects in memory and re-dispatches rules
 * with synthetic labeled/unlabeled events until the label set stabilizes.
 * Returns all effects to apply, with label effects collapsed to the net diff
 * so labels never flicker on GitHub. Non-converging rule sets are cut off
 * after MAX_LABEL_ROUNDS and reported via context.captureException.
 */
async function runLabelLoop(
  registryConfig: RegistryConfig,
  context: WebhookContext,
  initialEffects: Effect[],
): Promise<Effect[]> {
  const initial = payloadLabels(context);
  if (!initial) return initialEffects;

  const isLabelEffect = (e: Effect) => e.type === "addLabels" || e.type === "removeLabels";

  // Bot-added labels only carry a name; original labels keep their full objects.
  const labelObjects = new Map<string, LabelLike>(initial.map((l) => [l.name, l]));
  const initialNames = new Set(labelObjects.keys());
  const current = new Set(initialNames);

  const effects: Effect[] = initialEffects.filter((e) => !isLabelEffect(e));
  let roundEffects = initialEffects;
  let round = 0;

  while (true) {
    const { adds, removes } = labelChanges(roundEffects, current);
    if (adds.length === 0 && removes.length === 0) break;

    round++;
    if (round > MAX_LABEL_ROUNDS) {
      const err = new Error(
        `Label loop did not stabilize after ${MAX_LABEL_ROUNDS} rounds for ` +
          `${context.repository}#${tryNumber(context)} (${context.eventType}); ` +
          `still changing: +[${adds.join(", ")}] -[${removes.join(", ")}]`,
      );
      console.error(err.message);
      context.captureException?.(err);
      break;
    }

    for (const name of adds) {
      current.add(name);
      if (!labelObjects.has(name)) labelObjects.set(name, { name });
    }
    for (const name of removes) current.delete(name);

    // One synthetic event per changed label (as GitHub sends them), all
    // seeing the round's fully updated label set.
    const labels = [...current].map((name) => labelObjects.get(name) as LabelLike);
    const changes = [
      ...adds.map((name) => ({ name, action: "labeled" as const })),
      ...removes.map((name) => ({ name, action: "unlabeled" as const })),
    ];

    roundEffects = [];
    for (const change of changes) {
      const synthetic = await buildSyntheticLabelContext(context, change, labels);
      if (!synthetic) continue;
      roundEffects.push(...(await runMatchedRules(registryConfig, synthetic)));
    }
    effects.push(...roundEffects.filter((e) => !isLabelEffect(e)));
  }

  const netAdds = [...current].filter((name) => !initialNames.has(name));
  const netRemoves = [...initialNames].filter((name) => !current.has(name));
  if (netAdds.length > 0) effects.push({ type: "addLabels", labels: netAdds });
  if (netRemoves.length > 0) effects.push({ type: "removeLabels", label: netRemoves });
  return effects;
}

export async function dispatch(
  registryConfig: RegistryConfig,
  context: WebhookContext,
): Promise<Effect[]> {
  if (context.eventType === EventType.PULL_REQUEST_READY_FOR_REVIEW && !context.dryRun) {
    await maybeRedraftOnReady(context);
  }

  const initialEffects = await runMatchedRules(registryConfig, context);
  const effects = await runLabelLoop(registryConfig, context, initialEffects);

  await applyEffects(context, effects, {
    knownSectionIds: collectKnownDashboardSectionIds(registryConfig, context),
  });
  return effects;
}
