import type { CommandContext } from "./command-context.js";
import type { EventType } from "./event.js";
import type { RuleContext } from "./rule-context.js";
import type { CommandHelpEntry } from "./status/help.js";
import type { StatusSection } from "./status/types.js";

export type { CommandHelpEntry, CommandPermission } from "./status/help.js";

/**
 * Structured side-effects returned by a rule's event handler.
 * The dispatcher batches, deduplicates, and applies them. Rules never
 * call mutating GitHub or DB APIs directly.
 */
export type Effect =
  | { type: "addLabels"; labels: string[] }
  | {
      type: "addLabelsCrossRepo";
      owner: string;
      repo: string;
      issue_number: number;
      labels: string[];
    }
  | { type: "removeLabels"; labels: string[] }
  | { type: "addAssignees"; assignees: string[] }
  | { type: "comment"; body: string }
  | { type: "statusSection"; section: StatusSection }
  // Drop a section from the status comment — for state-derived sections whose
  // subject disappeared (e.g. the last `integration:` label was removed).
  | { type: "removeStatusSection"; id: string }
  // Command-use only (`ignore`/`unignore`): set or clear the author waiver on
  // one section. Rules re-emit sections instead; waivers stick across that.
  | { type: "overrideSection"; id: string; ignore: { reason: string } | null }
  | {
      type: "updatePullRequest";
      owner: string;
      repo: string;
      pull_number: number;
      state: "open" | "closed";
    }
  | {
      type: "requestReviewers";
      reviewers: string[];
    }
  | { type: "setTitle"; title: string }
  | { type: "setState"; state: "open" | "closed" }
  | { type: "removeAssignees"; assignees: string[] }
  // Command-use only: rules must not emit this — the engine already converts
  // the PR to draft when its checks fail (see syncStatus).
  | { type: "convertToDraft" }
  | { type: "markReadyForReview" }
  | { type: "updateBranch" };
// Cross-engine notification, disabled until the Discord engine goes live:
// a GitHub rule states a fact ({ type: "notify", topic, data }) and the
// message engine owns which channel it goes to and how it renders. To
// enable, add the variant to the union above and hand notify effects to the
// Discord engine in applyEffects (dispatch.ts).
//  | { type: "notify"; topic: string; data: Record<string, unknown> }

export type EventHandler<E extends EventType> = (
  context: RuleContext<E>,
) => Promise<Effect[] | undefined>;

export type EventHandlers = {
  [E in EventType]?: EventHandler<E>;
};

/**
 * A status section a rule may write. The title doubles as the section's
 * user-facing name — commands like `ignore` resolve it back to the ID, so it
 * must match what the section renders.
 */
export interface StatusSectionClaim {
  id: string;
  title: string;
}

export interface Rule {
  name: string;
  description: string;
  allowBots?: boolean;
  /**
   * Status sections this rule may emit. The dispatcher takes the union
   * across all rules registered for the repo/org and uses it to sweep stale
   * sections out of the status comment — any section in the existing
   * comment whose ID isn't claimed by some live rule gets removed on the
   * next status write.
   */
  statusSections?: readonly StatusSectionClaim[];
  events: EventHandlers;
}

/**
 * A comment command (`/<slug> <name> [args]`). Like rules, commands return
 * Effects instead of mutating GitHub directly. The declared constraints
 * (args, scope, permission) are enforced by the dispatcher, which answers
 * with a 👍/👎 reaction on the comment.
 *
 * The presentational fields (name, description, permission, example, scope)
 * live on {@link CommandHelpEntry} so the status module can render command
 * help without depending on the engine. Permission semantics: org members
 * may invoke everything; `author` additionally allows the target's author,
 * `code_owner` the labeled integration's code owners.
 */
export interface Command extends CommandHelpEntry {
  /** Whether at least one `"quoted"` argument after the name is required. */
  args?: "none" | "required";
  handle(context: CommandContext): Promise<Effect[] | undefined>;
}
