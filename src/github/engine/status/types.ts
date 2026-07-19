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
