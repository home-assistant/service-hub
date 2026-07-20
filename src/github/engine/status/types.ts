/**
 * `warn` renders in the checks table with a warning triangle but never fails
 * the aggregate — for conditions a reviewer should see without blocking the
 * author (member release-branch targets, author-waived checks).
 * Contextual content outside the checks table is a template block, not a
 * section — see blocks.ts.
 */
export type SectionStatus = "pass" | "fail" | "pending" | "warn" | "skip";

export interface StatusSection {
  id: string;
  title: string;
  status: SectionStatus;
  message: string;
  /**
   * Author waiver (`/<slug> ignore`). Persisted in the section state embedded
   * in the status comment, so it sticks across re-emissions: a rule
   * re-reporting `fail` on a later push stays waived until an explicit
   * `unignore`. Only affects how `fail`/`pending` present and aggregate.
   */
  ignored?: { reason: string };
}

/** A command-issued waiver change for one section; `ignore: null` un-waives. */
export interface SectionOverride {
  id: string;
  ignore: { reason: string } | null;
}

export const RULE_STATE_VERSION = 1;

/**
 * The complete persisted state of the status comment, stored as a single JSON
 * blob at the comment's tail (the comment is the database). Consumed by the
 * rendered dashboard, the aggregate commit status, and the draft decision.
 *
 * `sections` carry their own inline `ignored` waiver, so a waiver round-trips
 * with its rule. `blocks` are the typed template blocks (see blocks.ts).
 * `data` is a reserved bag for arbitrary rule-persisted state — unused today,
 * but a rule that needs to remember something across dispatches writes it here
 * rather than inventing a new marker.
 */
export interface RuleState {
  version: number;
  sections: StatusSection[];
  blocks: Record<string, unknown>;
  data: Record<string, unknown>;
}
