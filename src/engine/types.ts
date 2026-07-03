import type { EventType } from "../github/types.js";
import type { DashboardSection } from "./dashboard/types.js";
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
  | { type: "removeLabels"; label: string[] }
  | { type: "addAssignees"; assignees: string[] }
  | { type: "comment"; body: string }
  | { type: "dashboardSection"; section: DashboardSection }
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
    };

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
