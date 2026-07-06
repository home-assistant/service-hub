import type { CommandContext } from "./command-context.js";
import type { DashboardSection } from "./dashboard/types.js";
import type { EventType } from "./event.js";
import type { RuleContext } from "./rule-context.js";

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
  | { type: "dashboardSection"; section: DashboardSection }
  // Drop a section from the dashboard — for state-derived sections whose
  // subject disappeared (e.g. the last `integration:` label was removed).
  | { type: "removeDashboardSection"; id: string }
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
  // the PR to draft when its checks fail (see syncDashboardAndStatus).
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

export interface Rule {
  name: string;
  description: string;
  allowBots?: boolean;
  /**
   * Dashboard section IDs this rule may emit. The dispatcher takes the union
   * across all rules registered for the repo/org and uses it to sweep stale
   * sections out of the dashboard comment — any section in the existing
   * comment whose ID isn't claimed by some live rule gets removed on the
   * next dashboard write.
   */
  dashboardSections?: readonly string[];
  events: EventHandlers;
}

/**
 * Who may invoke a command; enforced by the dispatcher before handle() runs.
 * `author` allows the target's author and org members.
 */
export type CommandPermission = "none" | "author" | "code_owner" | "member";

/**
 * A comment command (`/<slug> <name> [args]`). Like rules, commands return
 * Effects instead of mutating GitHub directly — label effects go through the
 * label loop, so rules react to a command's changes exactly as they would to
 * a human's. The declared constraints (args, scope, permission) are enforced
 * by the dispatcher, which answers with a 👍/👎 reaction on the comment.
 */
export interface Command {
  name: string;
  description: string;
  /** Whether the rest-of-line argument after the name is required. */
  args?: "none" | "required";
  /**
   * Sample invocation without the `/<slug> ` prefix (e.g. `rename A better
   * title`), shown in rendered command help for arg-taking commands.
   */
  example?: string;
  scope?: "pull_request" | "issue" | "both";
  permission: CommandPermission;
  handle(context: CommandContext): Promise<Effect[] | undefined>;
}
