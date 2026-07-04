import type { Command, Rule } from "../engine/types.js";

/**
 * The authored description of what the bot does for one repository: a single
 * flat checklist of the checks that run there. PR-only and issue-only checks
 * live in the same list — each check self-declares the events it handles, and
 * the dispatcher only runs a check for events it declares, so an issue webhook
 * simply skips the PR-only checks (and vice versa).
 *
 * This file is the "at a glance" view: read `checks` top to bottom to know
 * exactly what the bot enforces on the repo. Group with comment headers as you
 * see fit — grouping is presentational and may differ per repo.
 */
export interface RepoManifest {
  /** Canonical `owner/repo` the manifest describes. */
  slug: string;
  /**
   * Additional slugs that should run this exact checklist (e.g. a personal
   * test fork). They share the same check instances — no duplication.
   */
  aliases?: string[];
  /** Every check that runs on this repo, in display order. */
  checks: Rule[];
  /** Comment commands (`/<slug> <name>`) available on this repo. */
  commands?: Command[];
}
