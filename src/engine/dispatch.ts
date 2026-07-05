import type { Octokit } from "@octokit/rest";
import { log } from "../log.js";
import type { CommandContext } from "./command-context.js";
import { ensureDashboardCommentExists, upsertDashboardComment } from "./dashboard/comment.js";
import { parseOverrides } from "./dashboard/overrides.js";
import type { DashboardSection } from "./dashboard/types.js";
import { EventType } from "./event.js";
import type { RuleContext } from "./rule-context.js";
import type { Command, Effect, Rule } from "./types.js";

export interface RegistryConfig {
  repositories: Record<string, Rule[]>;
  commands?: Record<string, Command[]>;
}

export function matchRules(registryConfig: RegistryConfig, context: RuleContext): Rule[] {
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
  context: RuleContext,
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
  context: RuleContext,
  effects: Effect[],
  config: ApplyEffectsConfig,
): Promise<void> {
  if (context.dryRun) {
    log.info("dry run", {
      repository: context.repository,
      eventType: context.eventType,
      number: context.number,
      effects: JSON.stringify(effects),
    });
    return;
  }

  const labels = new Set<string>();
  const removeLabels = new Set<string>();
  const dashboardSections = new Map<string, DashboardSection>();
  const removedSections = new Set<string>();
  const assignees = new Set<string>();
  const removeAssignees = new Set<string>();
  // Set: the label loop can run a rule twice per dispatch; identical comments post once.
  const comments = new Set<string>();
  const ops: Promise<unknown>[] = [];

  for (const effect of effects) {
    switch (effect.type) {
      case "addLabels":
        for (const l of effect.labels) labels.add(l);
        break;
      case "removeLabels":
        for (const l of effect.labels) removeLabels.add(l);
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
      case "removeDashboardSection":
        removedSections.add(effect.id);
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
            context.pullParams({ reviewers: effect.reviewers }),
          ),
        );
        break;
      case "setTitle":
        ops.push(context.github.issues.update(context.issueParams({ title: effect.title })));
        break;
      case "setState":
        ops.push(context.github.issues.update(context.issueParams({ state: effect.state })));
        break;
      case "removeAssignees":
        for (const a of effect.assignees) removeAssignees.add(a);
        break;
      case "convertToDraft":
        ops.push(draftPRIfNotDraft(context));
        break;
      case "markReadyForReview":
        ops.push(readyPRIfDraft(context));
        break;
      case "updateBranch":
        ops.push(updateBranchOrExplain(context));
        break;
    }
  }

  if (labels.size > 0) {
    ops.push(context.github.issues.addLabels(context.issueParams({ labels: [...labels] })));
  }

  for (const label of removeLabels) {
    if (labels.has(label)) continue;
    ops.push(
      context.github.issues.removeLabel(context.issueParams({ name: label })).catch(() => {}),
    );
  }

  // Emission wins over removal within a dispatch.
  for (const id of dashboardSections.keys()) removedSections.delete(id);

  if (dashboardSections.size > 0 || removedSections.size > 0) {
    // Post a placeholder dashboard *before* the other effects race, so the
    // dashboard is always the earliest comment on the PR. The real content
    // gets rendered by syncDashboardAndStatus below (which updates this
    // placeholder via findDashboardCommentId). Removals alone never create
    // a dashboard — there'd be nothing to remove from.
    if (dashboardSections.size > 0) {
      await ensureDashboardCommentExists(context.github, context.issueParams());
    }
    ops.push(
      syncDashboardAndStatus(context, [...dashboardSections.values()], removedSections, config),
    );
  }

  for (const body of comments) {
    ops.push(context.github.issues.createComment(context.issueParams({ body })));
  }

  if (assignees.size > 0) {
    ops.push(
      context.github.issues.addAssignees(context.issueParams({ assignees: [...assignees] })),
    );
  }

  if (removeAssignees.size > 0) {
    ops.push(
      context.github.issues.removeAssignees(
        context.issueParams({ assignees: [...removeAssignees] }),
      ),
    );
  }

  const settled = await Promise.allSettled(ops);
  for (const outcome of settled) {
    if (outcome.status === "rejected") {
      log.warn("applyEffects: operation failed", { error: String(outcome.reason) });
    }
  }
}

const HA_BOT_STATUS_CONTEXT = "ha-bot";

async function convertPullRequestToDraft(github: Octokit, nodeId: string): Promise<void> {
  await github.graphql(
    "mutation($id: ID!) { convertPullRequestToDraft(input: {pullRequestId: $id}) { clientMutationId } }",
    { id: nodeId },
  );
}

/** Convert the PR to draft unless it's already one */
async function draftPRIfNotDraft(context: RuleContext): Promise<void> {
  if (context.target.kind !== "pull_request") return;
  try {
    if (await context.target.isDraft()) return;
    await convertPullRequestToDraft(context.github, await context.target.nodeId());
  } catch (err) {
    log.warn("draftPRIfNotDraft failed", { error: String(err) });
  }
}

async function markPullRequestReadyForReview(github: Octokit, nodeId: string): Promise<void> {
  await github.graphql(
    "mutation($id: ID!) { markPullRequestReadyForReview(input: {pullRequestId: $id}) { clientMutationId } }",
    { id: nodeId },
  );
}

/** Remove the draft status unless the PR already has none. */
async function readyPRIfDraft(context: RuleContext): Promise<void> {
  if (context.target.kind !== "pull_request") return;
  if (!(await context.target.isDraft())) return;
  await markPullRequestReadyForReview(context.github, await context.target.nodeId());
}

/** Update the PR branch; surface API failures (conflicts, …) to the thread. */
async function updateBranchOrExplain(context: RuleContext): Promise<void> {
  if (context.target.kind !== "pull_request") return;
  try {
    await context.github.pulls.updateBranch(context.pullParams());
  } catch (err) {
    const e = err as { response?: { data?: { message?: string } }; message?: string };
    const message = e.response?.data?.message || e.message || "Unknown error";
    await context.github.issues.createComment(
      context.issueParams({ body: `Failed to update branch: ${message}` }),
    );
    throw err;
  }
}

/** Re-draft if the existing ha-bot aggregate on head SHA is failing. */
async function maybeRedraftOnReady(context: RuleContext): Promise<void> {
  if (context.target.kind !== "pull_request") return;
  try {
    const headSha = await context.target.headSha();
    const { data: statuses } = await context.github.repos.listCommitStatusesForRef(
      context.repoParams({ ref: headSha, per_page: 100 }),
    );
    const haBot = statuses.find((s) => s.context === HA_BOT_STATUS_CONTEXT);
    if (haBot?.state !== "failure") return;
    await draftPRIfNotDraft(context);
  } catch (err) {
    log.warn("maybeRedraftOnReady failed", { error: String(err) });
  }
}

function aggregateDashboardStatus(sections: DashboardSection[]): {
  state: "success" | "failure" | "pending";
  description: string;
} {
  const fails = sections.filter((s) => s.status === "fail").length;
  const pending = sections.filter((s) => s.status === "pending").length;
  const warns = sections.filter((s) => s.status === "warn").length;
  const skipped = sections.filter((s) => s.status === "skip").length;
  if (pending > 0) {
    return { state: "pending", description: `${pending} check${pending === 1 ? "" : "s"} pending` };
  }
  if (fails > 0) {
    return { state: "failure", description: `${fails} check${fails === 1 ? "" : "s"} failing` };
  }
  const extras = [
    ...(warns > 0 ? [`${warns} warning${warns === 1 ? "" : "s"}`] : []),
    ...(skipped > 0 ? [`${skipped} skipped`] : []),
  ];
  return {
    state: "success",
    description:
      extras.length > 0 ? `All checks passed (${extras.join(", ")})` : "All checks passed",
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
  context: RuleContext,
  newSections: DashboardSection[],
  removedSectionIds: ReadonlySet<string>,
  config: ApplyEffectsConfig,
): Promise<void> {
  const overrides = parseOverrides(await context.target.body());
  const result = await upsertDashboardComment(
    context.github,
    context.issueParams(),
    newSections,
    config.knownSectionIds,
    overrides,
    context.target.kind,
    {
      author: await context.target.authorLogin(),
      commandSlug: context.commandSlug,
      commands: context.commands,
    },
    removedSectionIds,
  );
  if (!result) return;
  if (context.target.kind !== "pull_request") return;
  const headSha = await context.target.headSha();
  if (!headSha) return;

  const aggregate = aggregateDashboardStatus(result.sections);
  // Sweep stale status checks (best-effort; failures here shouldn't sink the
  // primary write below). The bot writes only the `ha-bot` aggregate going
  // forward — anything else we created on this commit is from an older deploy.
  const sweep = sweepStaleStatusChecks(context, headSha).catch((err) => {
    log.warn("sweepStaleStatusChecks failed", { error: String(err) });
  });
  await context.github.repos.createCommitStatus(
    context.repoParams({
      sha: headSha,
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
async function sweepStaleStatusChecks(context: RuleContext, headSha: string): Promise<void> {
  const { data: statuses } = await context.github.repos.listCommitStatusesForRef(
    context.repoParams({ ref: headSha, per_page: 100 }),
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
  log.info("sweep: neutralizing stale statuses", {
    count: stale.length,
    contexts: stale.map((s) => s.context).join(", "),
  });
  await Promise.all(
    stale.map((s) =>
      context.github.repos
        .createCommitStatus(
          context.repoParams({
            sha: headSha,
            context: s.context,
            state: "success" as const,
            description: "No longer in use",
          }),
        )
        .catch((err) => {
          log.warn("sweep: failed to neutralize status", {
            context: s.context,
            error: String(err),
          });
        }),
    ),
  );
}

async function runMatchedRules(
  registryConfig: RegistryConfig,
  context: RuleContext,
): Promise<Effect[]> {
  const matched = matchRules(registryConfig, context);

  const settled = await Promise.allSettled(
    matched.map((rule) => {
      const handler = rule.events[context.eventType];
      if (!handler) return Promise.resolve(undefined);
      return (handler as (ctx: RuleContext) => Promise<Effect[] | undefined>)(context);
    }),
  );

  const effects: Effect[] = [];
  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    if (outcome.status === "rejected") {
      log.error("rule failed", {
        rule: matched[i].name,
        repository: context.repository,
        number: context.number,
        error: String(outcome.reason),
      });
    } else if (outcome.value) {
      effects.push(...outcome.value);
    }
  }
  return effects;
}

/** Synthetic rounds before the label loop declares the rule set non-converging. */
const MAX_LABEL_ROUNDS = 10;

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
    else if (effect.type === "removeLabels") for (const l of effect.labels) removed.add(l);
  }
  return {
    adds: [...added].filter((l) => !current.has(l)),
    removes: [...removed].filter((l) => current.has(l) && !added.has(l)),
  };
}

/**
 * Context for a synthetic labeled/unlabeled event: same dispatch, the target
 * entity's label state overridden to the simulated set. Undefined when no
 * matching EventType exists (issue unlabels).
 */
function syntheticLabelContext(
  context: RuleContext,
  change: { name: string; action: "labeled" | "unlabeled" },
  labels: string[],
): RuleContext | undefined {
  const target = context.target;
  if (target.kind === "pull_request") {
    const pr = target.withLabels(labels);
    return change.action === "labeled"
      ? context.withEvent({ type: EventType.PULL_REQUEST_LABELED, label: change.name }, pr)
      : context.withEvent({ type: EventType.PULL_REQUEST_UNLABELED, label: change.name }, pr);
  }
  // Issues have no unlabeled EventType; removals only count toward the net diff.
  if (change.action !== "labeled") return undefined;
  return context.withEvent(
    { type: EventType.ISSUES_LABELED, label: change.name },
    target.withLabels(labels),
  );
}

/**
 * The label loop: simulates label effects in memory and re-dispatches rules
 * with synthetic labeled/unlabeled events until the label set stabilizes.
 * Returns all effects to apply, with label effects collapsed to the net diff
 * so labels never flicker on GitHub. Non-converging rule sets are cut off
 * after MAX_LABEL_ROUNDS and reported to Sentry via log.exception.
 */
async function runLabelLoop(
  registryConfig: RegistryConfig,
  context: RuleContext,
  initialEffects: Effect[],
): Promise<Effect[]> {
  const isLabelEffect = (e: Effect) => e.type === "addLabels" || e.type === "removeLabels";
  if (!initialEffects.some(isLabelEffect)) return initialEffects;

  const initialNames = new Set(await context.target.labels());
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
          `${context.repository}#${context.number} (${context.eventType}); ` +
          `still changing: +[${adds.join(", ")}] -[${removes.join(", ")}]`,
      );
      log.exception(err);
      break;
    }

    for (const name of adds) current.add(name);
    for (const name of removes) current.delete(name);

    // One synthetic event per changed label (as GitHub sends them), all
    // seeing the round's fully updated label set.
    const labels = [...current];
    const changes = [
      ...adds.map((name) => ({ name, action: "labeled" as const })),
      ...removes.map((name) => ({ name, action: "unlabeled" as const })),
    ];

    roundEffects = [];
    for (const change of changes) {
      const synthetic = syntheticLabelContext(context, change, labels);
      if (!synthetic) continue;
      roundEffects.push(...(await runMatchedRules(registryConfig, synthetic)));
    }
    effects.push(...roundEffects.filter((e) => !isLabelEffect(e)));
  }

  const netAdds = [...current].filter((name) => !initialNames.has(name));
  const netRemoves = [...initialNames].filter((name) => !current.has(name));
  if (netAdds.length > 0) effects.push({ type: "addLabels", labels: netAdds });
  if (netRemoves.length > 0) effects.push({ type: "removeLabels", labels: netRemoves });
  return effects;
}

export async function dispatch(
  registryConfig: RegistryConfig,
  context: RuleContext,
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

export function findCommand(
  registryConfig: RegistryConfig,
  repository: string,
  name: string,
): Command | undefined {
  return (registryConfig.commands?.[repository] ?? []).find((command) => command.name === name);
}

/** Why the invocation may not run, or undefined when it may. */
async function commandRejection(
  command: Command | undefined,
  context: CommandContext,
): Promise<string | undefined> {
  if (!context.command) return "unparseable invocation";
  if (!command) return `unknown command "${context.command.name}"`;
  if (command.args === "required" && !context.command.args) return "missing argument";

  const scope = command.scope ?? "both";
  if (scope === "pull_request" && context.target.kind !== "pull_request") {
    return "only available on pull requests";
  }
  if (scope === "issue" && context.target.kind !== "issue") return "only available on issues";

  switch (command.permission) {
    case "none":
      return undefined;
    case "member":
      return (await context.senderIsMember()) ? undefined : "sender is not an org member";
    case "code_owner":
      return (await context.senderIsCodeOwner()) ? undefined : "sender is not a code owner";
    case "author": {
      const isAuthor =
        context.sender.login.toLowerCase() === (await context.target.authorLogin()).toLowerCase();
      if (isAuthor || (await context.senderIsMember())) return undefined;
      return "sender is neither the author nor an org member";
    }
  }
}

async function react(context: CommandContext, content: "+1" | "-1"): Promise<void> {
  if (context.dryRun) {
    log.info("dry run", { repository: context.repository, reaction: content });
    return;
  }
  try {
    await context.github.reactions.createForIssueComment(
      context.repoParams({ comment_id: context.commentId, content }),
    );
  } catch (err) {
    log.warn("command reaction failed", { error: String(err) });
  }
}

/**
 * The command counterpart of dispatch(): validate each invocation in the
 * comment against its command's declared constraints, run the handlers in
 * order, and apply the collected effects through the same label loop rules
 * use — so a command's label changes re-trigger label-listening rules
 * exactly like a human's would (command mutations arrive as self-webhooks,
 * which the entrypoint drops). A comment can carry several commands (one
 * per `/<slug>` line) mixed with prose. The invoking comment gets a 👍 when
 * every invocation ran and a 👎 when any was rejected or failed. Returns the
 * applied effects (post label loop), undefined when nothing ran.
 */
export async function dispatchCommand(context: CommandContext): Promise<Effect[] | undefined> {
  if (context.senderIsBot) return undefined;
  const registryConfig = context.registry;

  if (context.invocations.length === 0) {
    log.info("command rejected", {
      repository: context.repository,
      number: context.number,
      sender: context.sender.login,
      reason: "unparseable invocation",
    });
    await react(context, "-1");
    return undefined;
  }

  const collected: Effect[] = [];
  let anyRan = false;
  let anyFailed = false;

  for (const invocation of context.invocations) {
    const invocationContext = context.withInvocation(invocation);
    const command = findCommand(registryConfig, context.repository, invocation.name);
    const rejection = await commandRejection(command, invocationContext);
    if (rejection || !command) {
      log.info("command rejected", {
        repository: context.repository,
        number: context.number,
        command: invocation.name,
        sender: context.sender.login,
        reason: rejection,
      });
      anyFailed = true;
      continue;
    }

    log.info("command", {
      repository: context.repository,
      number: context.number,
      command: command.name,
      sender: context.sender.login,
    });

    try {
      const effects = await command.handle(invocationContext);
      if (effects?.length) collected.push(...effects);
      anyRan = true;
    } catch (err) {
      log.error("command failed", {
        repository: context.repository,
        number: context.number,
        command: command.name,
        error: String(err),
      });
      anyFailed = true;
    }
  }

  let finalEffects: Effect[] = [];
  if (collected.length) {
    finalEffects = await runLabelLoop(registryConfig, context, collected);
    await applyEffects(context, finalEffects, {
      knownSectionIds: collectKnownDashboardSectionIds(registryConfig, context),
    });
  }
  await react(context, anyFailed ? "-1" : "+1");
  return anyRan ? finalEffects : undefined;
}
