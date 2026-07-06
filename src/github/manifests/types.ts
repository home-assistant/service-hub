import type { Command, Rule } from "../engine/types.js";

/**
 * The authored description of what the bot does for one repository: a single
 * flat list of the rules that run there. PR-only and issue-only rules live in
 * the same list — each rule self-declares the events it handles, and the
 * dispatcher only runs a rule for events it declares, so an issue webhook
 * simply skips the PR-only rules (and vice versa).
 *
 * This file is the "at a glance" view: read `rules` top to bottom to know
 * exactly what the bot enforces on the repo. Group with comment headers as you
 * see fit — grouping is presentational and may differ per repo.
 */
export interface RepoManifest {
  /** Canonical `owner/repo` the manifest describes. */
  slug: string;
  /**
   * Additional slugs that should run this exact rule list (e.g. a personal
   * test fork). They share the same rule instances — no duplication.
   */
  aliases?: string[];
  /** Every rule that runs on this repo, in display order. */
  rules: Rule[];
  /** Comment commands (`/<slug> <name>`) available on this repo. */
  commands?: Command[];
}
