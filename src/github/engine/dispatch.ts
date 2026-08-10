import { log } from "../../log.js";
import { EventType } from "./event.js";
import type { CommandContext } from "./model/command-context.js";
import type { RuleContext } from "./model/rule-context.js";
import { draftPRIfNotDraft } from "./pr-state.js";
import type { BlockArgsMap, BlockId } from "./status/blocks.js";
import { hasFailingSections } from "./status/build.js";
import { emptyRuleState, parseState } from "./status/render.js";
import type { SectionOverride, StatusSection } from "./status/types.js";
import { locateStatusComment, syncDashboard, updateCommitStatus } from "./status-sync.js";
import type { Command, Effect, RegistryConfig, Rule, RuleOutput } from "./types.js";

export function matchRules(context: RuleContext): Rule[] {
  const repoRules = context.registry.repositories[context.repo.fullName] ?? [];

  return repoRules.filter(
    (rule) =>
      (rule.allowBots !== false || !context.senderIsBot) &&
      Object.hasOwn(rule.events, context.eventType),
  );
}

/** Collect every statusSection ID claimed by some rule in this repo's registry. */
function collectKnownStatusSectionIds(context: RuleContext): Set<string> {
  const ids = new Set<string>();
  const rules = context.registry.repositories[context.repo.fullName] ?? [];
  for (const rule of rules) {
    if (rule.statusSections) for (const { id } of rule.statusSections) ids.add(id);
  }
  return ids;
}

/**
 * Everything the matched rules (or commands) produced in one dispatch,
 * bucketed by domain. `data` starts as the persisted per-rule state bag and
 * accumulates this dispatch's state updates.
 */
interface CollectedOutputs {
  statuses: Map<string, StatusSection>;
  overrides: SectionOverride[];
  /** Block updates by id; null args = clear. Later updates win within a dispatch. */
  blocks: Map<BlockId, BlockArgsMap[BlockId] | null>;
  effects: Effect[];
  data: Record<string, unknown>;
  dataChanged: boolean;
}

function newCollected(data: Record<string, unknown>): CollectedOutputs {
  return {
    statuses: new Map(),
    overrides: [],
    blocks: new Map(),
    effects: [],
    data,
    dataChanged: false,
  };
}

/**
 * Fold one rule's output into the dispatch buckets. `stateKey` is the rule
 * name owning the state slice; without one (commands) `state` is ignored.
 */
function collectOutput(collected: CollectedOutputs, output: RuleOutput, stateKey?: string): void {
  for (const status of output.statuses ?? []) collected.statuses.set(status.id, status);
  for (const block of output.blocks ?? []) collected.blocks.set(block.block, block.args);

  collected.overrides.push(...(output.overrides ?? []));
  collected.effects.push(...(output.effects ?? []));

  if (stateKey && output.state !== undefined) {
    if (output.state === null) delete collected.data[stateKey];
    else collected.data[stateKey] = output.state;
    collected.dataChanged = true;
  }
}

/** Drop state slices owned by no live rule (removed/renamed rules). */
function pruneData(
  data: Record<string, unknown>,
  ruleNames: ReadonlySet<string>,
): { data: Record<string, unknown>; swept: boolean } {
  const pruned: Record<string, unknown> = {};
  let swept = false;
  for (const [key, value] of Object.entries(data)) {
    if (ruleNames.has(key)) pruned[key] = value;
    else swept = true;
  }
  return { data: pruned, swept };
}

/**
 * Apply the GitHub side effects.
 */
async function applyEffects(context: RuleContext, effects: Effect[]): Promise<void> {
  const labels = new Set<string>();
  const removeLabels = new Set<string>();
  const assignees = new Set<string>();
  const removeAssignees = new Set<string>();
  const comments = new Set<string>();
  // Thunks, not started promises: awaits happen between collection and the
  // allSettled below, and a rejection during that window would be an
  // unhandled rejection (which kills the process) instead of a logged failure.
  const ops: (() => Promise<unknown>)[] = [];

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
      case "addLabelsCrossRepo":
        ops.push(() =>
          context.github.issues.addLabels({
            owner: effect.owner,
            repo: effect.repo,
            issue_number: effect.issue_number,
            labels: effect.labels,
          }),
        );
        break;
      case "updatePullRequest":
        ops.push(() =>
          context.github.pulls.update({
            owner: effect.owner,
            repo: effect.repo,
            pull_number: effect.pull_number,
            state: effect.state,
          }),
        );
        break;
      case "requestReviewers":
        ops.push(() =>
          context.github.pulls.requestReviewers(
            context.pullParams({ reviewers: effect.reviewers }),
          ),
        );
        break;
      case "dismissReview":
        ops.push(() =>
          context.github.pulls.dismissReview(
            context.pullParams({ review_id: effect.reviewId, message: effect.message }),
          ),
        );
        break;
      case "setTitle":
        ops.push(() => context.github.issues.update(context.issueParams({ title: effect.title })));
        break;
      case "setState":
        ops.push(() => context.github.issues.update(context.issueParams({ state: effect.state })));
        break;
      case "removeAssignees":
        for (const a of effect.assignees) removeAssignees.add(a);
        break;
      case "convertToDraft":
        ops.push(() => draftPRIfNotDraft(context));
        break;
      case "updateBranch":
        ops.push(() => updateBranchOrExplain(context));
        break;
    }
  }

  // Collapse label effects to the net diff against the item's current labels,
  // so re-emitted labels don't produce API calls (rules emit unconditionally).
  if (labels.size > 0 || removeLabels.size > 0) {
    const current = new Set(await context.target.labels());
    const toAdd = [...labels].filter((label) => !current.has(label));
    if (toAdd.length > 0) {
      ops.push(() => context.github.issues.addLabels(context.issueParams({ labels: toAdd })));
    }

    for (const label of removeLabels) {
      if (labels.has(label)) {
        log.warn("applyEffects: label added and removed in the same dispatch; add wins", {
          repository: context.repo.fullName,
          number: context.number,
          label,
        });
        continue;
      }
      if (!current.has(label)) continue;
      ops.push(() => context.github.issues.removeLabel(context.issueParams({ name: label })));
    }
  }

  for (const body of comments) {
    ops.push(() => context.github.issues.createComment(context.issueParams({ body })));
  }

  if (assignees.size > 0) {
    ops.push(() =>
      context.github.issues.addAssignees(context.issueParams({ assignees: [...assignees] })),
    );
  }

  if (removeAssignees.size > 0) {
    ops.push(() =>
      context.github.issues.removeAssignees(
        context.issueParams({ assignees: [...removeAssignees] }),
      ),
    );
  }

  const settled = await Promise.allSettled(ops.map((op) => op()));
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

/** What one dispatch concluded: the emitted check outcomes and side effects. */
export interface DispatchResult {
  statuses: StatusSection[];
  effects: Effect[];
}

async function runMatchedRules(
  context: RuleContext,
  data: Record<string, unknown>,
): Promise<CollectedOutputs> {
  const matched = matchRules(context);

  const settled = await Promise.allSettled(
    matched.map((rule) => {
      const handler = rule.events[context.eventType];
      if (!handler) return Promise.resolve(undefined);
      return (handler as (ctx: RuleContext, state: unknown) => Promise<RuleOutput | undefined>)(
        context,
        data[rule.name],
      );
    }),
  );

  const collected = newCollected({ ...data });
  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    if (outcome.status === "rejected") {
      log.exception(outcome.reason, {
        rule: matched[i].name,
        repository: context.repo.fullName,
        number: context.number,
      });
    } else if (outcome.value) {
      collectOutput(collected, outcome.value, matched[i].name);
    }
  }
  return collected;
}

export async function dispatch(context: RuleContext): Promise<DispatchResult> {
  const knownSectionIds = collectKnownStatusSectionIds(context);
  const opened = context.eventType === EventType.PULL_REQUEST_OPENED;

  // The dispatch's single status-comment read. Opened dispatches create the
  // placeholder up front so it is the PR's earliest comment; a fresh
  // placeholder starts from empty persisted state, skipping the parse.
  let comment = await locateStatusComment(context.github, context.issueParams(), {
    createIfMissing: opened,
  });
  let previous = comment ? (comment.fresh ? emptyRuleState() : parseState(comment.body)) : null;

  const ruleNames = new Set(
    (context.registry.repositories[context.repo.fullName] ?? []).map((rule) => rule.name),
  );
  const { data, swept } = pruneData(previous?.data ?? {}, ruleNames);

  const output = await runMatchedRules(context, data);
  output.dataChanged ||= swept;

  // A dispatch that shows something for the first time creates the
  // placeholder late — find-or-create, since a concurrent dispatch may have
  // raced us — so the status comment still lands above any comment effects
  // this dispatch applies below. Clears or waiver changes alone never create
  // a status comment; there'd be nothing to act on.
  const showsAnything =
    output.statuses.size > 0 || [...output.blocks.values()].some((args) => args !== null);
  if (!comment && showsAnything) {
    comment = await locateStatusComment(context.github, context.issueParams(), {
      createIfMissing: true,
    });
    if (comment && !comment.fresh) previous = parseState(comment.body);
  }

  // Opened dispatches sync unconditionally: the placeholder must become the
  // greeting dashboard even when no rule emitted anything.
  const syncNeeded =
    opened ||
    comment?.fresh ||
    output.statuses.size > 0 ||
    output.overrides.length > 0 ||
    output.blocks.size > 0 ||
    output.dataChanged;

  // The dashboard write and the side effects are independent — run them
  // concurrently. Neither may sink the other: applyEffects logs per-op
  // failures itself, dashboard failures are logged here.
  const [dashboard] = await Promise.all([
    syncNeeded
      ? syncDashboard(
          context,
          {
            sections: [...output.statuses.values()],
            overrides: output.overrides,
            blocks: output.blocks,
            data: output.data,
          },
          comment,
          previous,
          knownSectionIds,
        ).catch((err) => {
          log.warn("syncDashboard failed", { error: String(err) });
          return null;
        })
      : Promise.resolve(null),
    applyEffects(context, output.effects),
  ]);

  // The merge gate: one aggregate `ha-bot` commit status on the PR head,
  // deep-linking to the dashboard comment.
  if (dashboard?.commentUrl && context.target.kind === "pull_request") {
    try {
      await updateCommitStatus(context, dashboard.aggregate, dashboard.commentUrl);
    } catch (err) {
      log.warn("commit status update failed", { error: String(err) });
    }
  }

  // Without a dashboard write, the section state is whatever the located
  // comment already carried (minus rows no live rule claims).
  const sections =
    dashboard?.sections ?? (previous?.sections ?? []).filter((s) => knownSectionIds.has(s.id));

  // Failing checks ⇒ draft is an invariant reconciled on every dispatch, not
  // just when a rule re-reports the failure — so a missed webhook or a
  // once-failed draft call gets repaired by the next event of any kind
  // (going ready-for-review with failing checks is one more instance).
  // Waived failures don't count (`ignore` is the sanctioned way to keep a PR
  // ready over a failing row), and `pending` never drafts: pending checks
  // wait on someone other than the author (e.g. a code-owner review), and a
  // draft would hide the PR from the very people who can resolve them.
  if (
    context.target.kind === "pull_request" &&
    hasFailingSections(sections) &&
    (await context.target.state()) === "open"
  ) {
    await draftPRIfNotDraft(context);
  }

  return { statuses: [...output.statuses.values()], effects: output.effects };
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
    case "author_or_code_owner": {
      const isAuthor =
        context.sender.login.toLowerCase() === (await context.target.authorLogin()).toLowerCase();
      if (isAuthor || (await context.senderIsMember()) || (await context.senderIsCodeOwner())) {
        return undefined;
      }
      return "sender is neither the author, a code owner, nor an org member";
    }
  }
}

async function react(context: CommandContext, content: "+1" | "-1"): Promise<void> {
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
 * order, and apply the collected outputs. A comment can carry several
 * commands (one per `/<slug>` line) mixed with prose. The invoking comment
 * gets a 👍 when every invocation ran and a 👎 when any was rejected or
 * failed. Returns the applied outputs, undefined when nothing ran.
 */
export async function dispatchCommand(
  context: CommandContext,
): Promise<DispatchResult | undefined> {
  if (context.senderIsBot) return undefined;
  const registryConfig = context.registry;

  if (context.invocations.length === 0) {
    log.info("command rejected", {
      repository: context.repo.fullName,
      number: context.number,
      sender: context.sender.login,
      reason: "unparseable invocation",
    });
    await react(context, "-1");
    return undefined;
  }

  const collected = newCollected({});
  let anyOutputs = false;
  let anyRan = false;
  let anyFailed = false;

  for (const invocation of context.invocations) {
    const invocationContext = context.withInvocation(invocation);
    const command = findCommand(registryConfig, context.repo.fullName, invocation.name);
    const rejection = await commandRejection(command, invocationContext);
    if (rejection || !command) {
      log.info("command rejected", {
        repository: context.repo.fullName,
        number: context.number,
        command: invocation.name,
        sender: context.sender.login,
        reason: rejection,
      });
      anyFailed = true;
      continue;
    }

    log.info("command", {
      repository: context.repo.fullName,
      number: context.number,
      command: command.name,
      sender: context.sender.login,
    });

    try {
      const output = await command.handle(invocationContext);
      if (output) {
        collectOutput(collected, output);
        anyOutputs = true;
      }
      anyRan = true;
    } catch (err) {
      log.error("command failed", {
        repository: context.repo.fullName,
        number: context.number,
        command: command.name,
        error: String(err),
      });
      anyFailed = true;
    }
  }

  if (anyOutputs) {
    const knownSectionIds = collectKnownStatusSectionIds(context);

    // Commands never create the status comment — waiver changes alone have
    // nothing to act on. But the dashboard rewrite embeds the whole persisted
    // blob, so locate and parse it so the rule state data rides along.
    const comment = await locateStatusComment(context.github, context.issueParams(), {
      createIfMissing: false,
    });
    const previous = comment ? parseState(comment.body) : null;
    collected.data = previous?.data ?? {};

    const syncNeeded =
      collected.statuses.size > 0 || collected.overrides.length > 0 || collected.blocks.size > 0;

    const [dashboard] = await Promise.all([
      syncNeeded
        ? syncDashboard(
            context,
            {
              sections: [...collected.statuses.values()],
              overrides: collected.overrides,
              blocks: collected.blocks,
              data: collected.data,
            },
            comment,
            previous,
            knownSectionIds,
          ).catch((err) => {
            log.warn("syncDashboard failed", { error: String(err) });
            return null;
          })
        : Promise.resolve(null),
      applyEffects(context, collected.effects),
    ]);

    if (dashboard?.commentUrl && context.target.kind === "pull_request") {
      try {
        await updateCommitStatus(context, dashboard.aggregate, dashboard.commentUrl);
      } catch (err) {
        log.warn("commit status update failed", { error: String(err) });
      }
    }

    // The same failing ⇒ draft reconciliation as dispatch(): a command
    // dispatch repairs a missed draft too.
    const sections =
      dashboard?.sections ?? (previous?.sections ?? []).filter((s) => knownSectionIds.has(s.id));
    if (
      context.target.kind === "pull_request" &&
      hasFailingSections(sections) &&
      (await context.target.state()) === "open"
    ) {
      await draftPRIfNotDraft(context);
    }
  }
  await react(context, anyFailed ? "-1" : "+1");
  return anyRan
    ? { statuses: [...collected.statuses.values()], effects: collected.effects }
    : undefined;
}
