import { log } from "../../log.js";
import type { CommandContext } from "./command-context.js";
import { EventType } from "./event.js";
import { draftPRIfNotDraft, readyPRIfDraft } from "./pr-state.js";
import type { RuleContext } from "./rule-context.js";
import { hasFailingSections } from "./status/build.js";
import type { SectionOverride, StatusSection } from "./status/types.js";
import { ensureStatusCommentExists, findStatusComment, syncStatus } from "./status-sync.js";
import type { Command, Effect, Rule } from "./types.js";

export interface RegistryConfig {
  repositories: Record<string, Rule[]>;
  commands?: Record<string, Command[]>;
  /** Per-repo CODEOWNERS path for an integration domain (code-owner checks). */
  integrationPaths?: Record<string, (domain: string) => string>;
}

export function matchRules(registryConfig: RegistryConfig, context: RuleContext): Rule[] {
  const repoRules = registryConfig.repositories[context.repository] ?? [];

  return repoRules.filter(
    (rule) =>
      (rule.allowBots !== false || !context.senderIsBot) &&
      Object.hasOwn(rule.events, context.eventType),
  );
}

/** Collect every statusSection ID claimed by some rule in this repo's registry. */
function collectKnownStatusSectionIds(
  registryConfig: RegistryConfig,
  context: RuleContext,
): Set<string> {
  const ids = new Set<string>();
  const rules = registryConfig.repositories[context.repository] ?? [];
  for (const rule of rules) {
    if (rule.statusSections) for (const { id } of rule.statusSections) ids.add(id);
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
  const statusSections = new Map<string, StatusSection>();
  const removedSections = new Set<string>();
  const overrides: SectionOverride[] = [];
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
      case "statusSection":
        statusSections.set(effect.section.id, effect.section);
        break;
      case "removeStatusSection":
        removedSections.add(effect.id);
        break;
      case "overrideSection":
        overrides.push({ id: effect.id, ignore: effect.ignore });
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
  for (const id of statusSections.keys()) removedSections.delete(id);

  if (statusSections.size > 0 || removedSections.size > 0 || overrides.length > 0) {
    // Post a placeholder status comment *before* the other effects race, so
    // it is always the earliest comment on the PR. The real content gets
    // rendered by syncStatus below (which updates this placeholder via
    // findStatusComment). Removals or waiver changes alone never create a
    // status comment — there'd be nothing to act on.
    if (statusSections.size > 0) {
      await ensureStatusCommentExists(context.github, context.issueParams());
    }
    ops.push(
      syncStatus(
        context,
        { sections: [...statusSections.values()], removedSectionIds: removedSections, overrides },
        config.knownSectionIds,
      ),
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

/** Re-draft if the PR's status comment still shows failing (not pending) checks. */
async function maybeRedraftOnReady(context: RuleContext): Promise<void> {
  if (context.target.kind !== "pull_request") return;
  try {
    const existing = await findStatusComment(context.github, context.issueParams());
    if (!existing) return;
    if (!hasFailingSections(existing.body)) return;
    await draftPRIfNotDraft(context);
  } catch (err) {
    log.warn("maybeRedraftOnReady failed", { error: String(err) });
  }
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
      log.exception(outcome.reason, {
        rule: matched[i].name,
        repository: context.repository,
        number: context.number,
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
    knownSectionIds: collectKnownStatusSectionIds(registryConfig, context),
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
  if (context.command.malformed) return 'arguments must be wrapped in quotes: `"<argument>"`';
  if (command.args === "required" && context.command.args.length === 0) {
    return "missing argument";
  }

  const scope = command.scope ?? "both";
  if (scope === "pull_request" && context.target.kind !== "pull_request") {
    return "only available on pull requests";
  }
  if (scope === "issue" && context.target.kind !== "issue") return "only available on issues";

  switch (command.permission) {
    case "none":
      return undefined;
    case "code_owner": {
      if ((await context.senderIsMember()) || (await context.senderIsCodeOwner())) {
        return undefined;
      }
      return "sender is neither a code owner nor an org member";
    }
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
      knownSectionIds: collectKnownStatusSectionIds(registryConfig, context),
    });
  }
  await react(context, anyFailed ? "-1" : "+1");
  return anyRan ? finalEffects : undefined;
}
