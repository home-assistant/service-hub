import type { EventType } from "./event.js";
import type { CommandContext } from "./model/command-context.js";
import type { RuleContext } from "./model/rule-context.js";
import type { BlockArgsMap, BlockId } from "./status/blocks.js";
import type { CommandHelpEntry } from "./status/help.js";
import type { SectionOverride, StatusSection } from "./status/types.js";

export type { CommandHelpEntry, CommandPermission } from "./status/help.js";

/**
 * Structured GitHub side-effects returned by a rule's event handler.
 * The dispatcher batches, deduplicates, and applies them. Rules never
 * call mutating GitHub or DB APIs directly. Status/dashboard outputs are
 * not effects — they travel on their own {@link RuleOutput} channels.
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
  | { type: "dismissReview"; reviewId: number; message: string }
  | { type: "setTitle"; title: string }
  | { type: "setState"; state: "open" | "closed" }
  | { type: "removeAssignees"; assignees: string[] }
  // Most rules should not require this: The engine already converts
  // the PR to draft when its checks fail
  | { type: "convertToDraft" }
  | { type: "updateBranch" };
// Cross-engine notification, disabled until the Discord engine goes live:
// a GitHub rule states a fact ({ type: "notify", topic, data }) and the
// message engine owns which channel it goes to and how it renders. To
// enable, add the variant to the union above and hand notify effects to the
// Discord engine in applyEffects (dispatch.ts).
//  | { type: "notify"; topic: string; data: Record<string, unknown> }

/** A typed update to one dashboard template block; `args: null` clears it. */
export type BlockUpdate = {
  [B in BlockId]: { block: B; args: BlockArgsMap[B] | null };
}[BlockId];

/**
 * Everything one rule (or command) concluded in one evaluation, split by
 * domain. `effects` are GitHub mutations; the other channels feed the status
 * subsystem — the dashboard comment, the aggregate merge gate, and the
 * draft decision — which never sees effects.
 */
export interface RuleOutput {
  /**
   * Check outcomes: dashboard rows that also drive the aggregate commit
   * status and the draft-on-failure decision.
   */
  statuses?: StatusSection[];
  /** Template block updates outside the checks table — see status/blocks.ts. */
  blocks?: BlockUpdate[];
  /**
   * Command-use only (`ignore`/`unignore`): set or clear the author waiver on
   * one section. Rules re-emit sections instead; waivers stick across that.
   */
  overrides?: SectionOverride[];
  /** GitHub side effects: labels, comments, assignees, API operations. */
  effects?: Effect[];
  /**
   * Replaces this rule's slice of the per-rule state persisted in the status
   * comment (keyed by rule name). `null` clears the slice; omitted/undefined
   * leaves it untouched. Must be JSON-serializable, and — like everything in
   * the comment blob — treated as untrusted on read (comments are editable).
   * Rules only; ignored for commands. Persists only while a status comment
   * exists (the comment is the database).
   */
  state?: unknown;
}

export type EventHandler<E extends EventType> = (
  context: RuleContext<E>,
  /** This rule's persisted state slice, parsed from the status comment; undefined when none. */
  state: unknown,
) => Promise<RuleOutput | undefined>;

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
 * a {@link RuleOutput} instead of mutating GitHub directly. The declared constraints
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
  handle(context: CommandContext): Promise<RuleOutput | undefined>;
}

/**
 * The compiled runtime registry the engine consumes, keyed by full repo slug
 * (aliases included). Manifests are the authoring format; manifests/index.ts
 * compiles them into this shape.
 */
export interface RegistryConfig {
  repositories: Record<string, Rule[]>;
  commands?: Record<string, Command[]>;
  /** Per-repo CODEOWNERS path for an integration domain (code-owner checks). */
  integrationPaths?: Record<string, (domain: string) => string>;
}
