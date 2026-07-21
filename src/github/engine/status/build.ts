import { BLOCK_IDS, type BlockStates } from "./blocks.js";
import type { CommandHelpEntry } from "./help.js";
import { displaySection, parseState, renderStatus, type StatusTarget } from "./render.js";
import type { SectionOverride, StatusSection } from "./types.js";

/**
 * Everything one status computation needs, fetched by the caller. The status
 * comment is the database: `previousBody` carries the persisted section state
 * (including waivers), and the output body embeds the updated state.
 */
export interface StatusInput {
  target: {
    kind: StatusTarget;
    /** `owner/repo`, for the friendly-name greeting. */
    repoFullName: string;
    /** Target author login, mentioned in the issue greeting. */
    author?: string;
  };
  /** Sections emitted this dispatch; merged over the persisted ones by id. */
  newSections: StatusSection[];
  /** Waiver changes from `ignore`/`unignore` commands, applied last. */
  overrides: readonly SectionOverride[];
  /** Block updates this dispatch: args replace the persisted state, `null` clears. */
  blocks?: ReadonlyMap<string, unknown>;
  /** Body of the existing status comment, or null when none exists yet. */
  previousBody: string | null;
  /** Section IDs some live rule claims; anything else is swept as stale. */
  knownSectionIds: ReadonlySet<string>;
  help: { commandSlug: string; commands: readonly CommandHelpEntry[] };
}

/**
 * `pending` sections fail the aggregate like `fail` ones — both block the
 * merge — but only `fail` drafts the PR: pending checks wait on someone other
 * than the author (e.g. a code-owner review), and a draft would hide the PR
 * from the very people who can resolve them.
 */
export interface StatusAggregate {
  state: "success" | "failure";
  description: string;
  shouldDraft: boolean;
}

export interface StatusOutput {
  /** Full comment markdown; null = nothing to show and no comment exists. */
  body: string | null;
  /** Post-merge, post-override section state (what `body` embeds). */
  sections: StatusSection[];
  /** Post-merge block state (what `body` embeds). */
  blocks: BlockStates;
  aggregate: StatusAggregate;
}

/**
 * The pure core of the status comment: parse the persisted sections, sweep
 * the stale ones, merge in this dispatch's sections (new data wins, waivers
 * stick), apply removals and waiver changes, then render and aggregate.
 * No I/O — the caller locates the comment, feeds its body in, and writes the
 * resulting body and commit status back.
 */
export function buildStatus(input: StatusInput): StatusOutput {
  const prev = input.previousBody ? parseState(input.previousBody) : null;

  const byId = new Map<string, StatusSection>();
  if (prev) {
    for (const s of prev.sections) {
      if (input.knownSectionIds.has(s.id)) byId.set(s.id, s);
    }
  }

  // Merge by id: new data wins, but a persisted waiver survives re-emission —
  // a rule re-reporting `fail` must not silently undo an author's `ignore`.
  for (const s of input.newSections) {
    const prior = byId.get(s.id);
    byId.set(s.id, prior?.ignored && !s.ignored ? { ...s, ignored: prior.ignored } : s);
  }

  for (const o of input.overrides) {
    const section = byId.get(o.id);
    if (!section) continue;
    if (o.ignore) {
      byId.set(o.id, { ...section, ignored: o.ignore });
    } else {
      const { ignored: _cleared, ...rest } = section;
      byId.set(o.id, rest);
    }
  }

  // Blocks merge like sections, minus waivers: persisted state in, ids no
  // block in blocks.ts claims swept out, this dispatch's updates applied
  // (args replace the state; null clears the block).
  const blocks: Record<string, unknown> = {};
  if (prev) {
    const knownBlockIds = new Set<string>(BLOCK_IDS);
    for (const [id, args] of Object.entries(prev.blocks)) {
      if (knownBlockIds.has(id)) blocks[id] = args;
    }
  }
  for (const [id, args] of input.blocks ?? []) {
    if (args === null) delete blocks[id];
    else blocks[id] = args;
  }

  // Reserved rule state: nothing writes it yet, so carry it through untouched.
  const data = prev?.data ?? {};

  const sections = [...byId.values()];
  const blockStates = blocks as BlockStates;
  const aggregate = aggregateStatus(sections);

  // No comment exists and nothing survived to show: don't create one.
  if (!input.previousBody && sections.length === 0 && Object.keys(blocks).length === 0) {
    return { body: null, sections, blocks: blockStates, aggregate };
  }

  const body = renderStatus(sections, input.target.repoFullName, input.target.kind, {
    author: input.target.author,
    commandSlug: input.help.commandSlug,
    commands: input.help.commands,
    blocks: blockStates,
    data,
  });
  return { body, sections, blocks: blockStates, aggregate };
}

/** Aggregate over the presented statuses, so waived checks count as warnings. */
function aggregateStatus(sections: StatusSection[]): StatusAggregate {
  const display = sections.map(displaySection);
  const fails = display.filter((s) => s.status === "fail").length;
  const pending = display.filter((s) => s.status === "pending").length;
  const warns = display.filter((s) => s.status === "warn").length;
  const skipped = display.filter((s) => s.status === "skip").length;
  if (fails > 0) {
    return {
      state: "failure",
      description: `${fails} check${fails === 1 ? "" : "s"} failing`,
      shouldDraft: true,
    };
  }
  if (pending > 0) {
    return {
      state: "failure",
      description: `${pending} check${pending === 1 ? "" : "s"} pending`,
      shouldDraft: false,
    };
  }
  const extras = [
    ...(warns > 0 ? [`${warns} warning${warns === 1 ? "" : "s"}`] : []),
    ...(skipped > 0 ? [`${skipped} skipped`] : []),
  ];
  return {
    state: "success",
    description:
      extras.length > 0 ? `All checks passed (${extras.join(", ")})` : "All checks passed",
    shouldDraft: false,
  };
}

/**
 * Whether a status comment body carries a check that presents as failing —
 * waived failures don't count, and sections no live rule claims are ignored
 * (a removed/renamed rule's stale row must not re-draft a PR). Backs the
 * engine's re-draft-on-ready guard.
 */
export function hasFailingSections(body: string, knownSectionIds: ReadonlySet<string>): boolean {
  return parseState(body)
    .sections.filter((s) => knownSectionIds.has(s.id))
    .map(displaySection)
    .some((s) => s.status === "fail");
}
