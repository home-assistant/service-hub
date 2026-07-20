import { log } from "../../../log.js";
import type { BlockStates } from "./blocks.js";
import { type CommandHelpEntry, commandsForTarget, commandViews } from "./help.js";
import { loadTemplate, renderTemplate } from "./template.js";
import {
  RULE_STATE_VERSION,
  type RuleState,
  type SectionStatus,
  type StatusSection,
} from "./types.js";

// The sentinel identifies the bot's status comment among all issue comments.
// The whole persisted state round-trips through a single JSON blob in the
// `ha-bot-state` HTML comment at the comment's tail.
const SENTINEL = "<!-- ha-bot-dashboard -->";
const STATE_PREFIX = "<!-- ha-bot-state:";
const MARKER_SUFFIX = " -->";

// Legacy per-entry markers (pre-blob deploys). Still parsed so waivers on
// already-open PRs survive the switch; never written anymore.
const SECTION_PREFIX = "<!-- section:";
const BLOCK_PREFIX = "<!-- block:";

const FRIENDLY_NAMES: Record<string, string> = {
  "home-assistant/core": "Home Assistant",
  "justanotherariel/hass_core": "Home Assistant", // TODO: Remove this
};

const STATUS_ICONS: Record<SectionStatus, string> = {
  pass: ":white_check_mark:",
  pending: ":hourglass:",
  warn: ":warning:",
  fail: ":x:",
  skip: ":heavy_minus_sign:",
};

// Layout and prose live in the templates; this module only builds views.
// The sentinel is written literally there but grepped for here — fail at
// load if a template edit breaks the pair (comment detection depends on it).
const PR_TEMPLATE = loadTemplate("pr-dashboard");
const ISSUE_TEMPLATE = loadTemplate("issue-dashboard");
for (const template of [PR_TEMPLATE, ISSUE_TEMPLATE]) {
  if (!template.includes(SENTINEL)) {
    throw new Error("dashboard template lost its sentinel comment");
  }
}

export type StatusTarget = "pull_request" | "issue";

/** Repo/dispatch details the renderer weaves into the boilerplate. */
export interface StatusExtras {
  /** Target author login, mentioned in the issue greeting. */
  author?: string;
  /** Comment-command prefix; defaults to `ha-bot`. */
  commandSlug?: string;
  /** The repo's registered commands, listed in the collapsed help. */
  commands?: readonly CommandHelpEntry[];
  /** Visible template blocks with their args (see blocks.ts). */
  blocks?: BlockStates;
  /** Reserved rule-persisted state, round-tripped verbatim into the blob. */
  data?: Record<string, unknown>;
}

/** Whether a comment body is the bot's status comment. */
export function isStatusComment(body: string): boolean {
  return body.includes(SENTINEL);
}

/** Stub body posted early so the status comment sits above other comments. */
export function placeholderBody(): string {
  return `${SENTINEL}\n\n_Evaluating rules…_`;
}

/**
 * How a section presents: waived `fail`/`pending` rows show as warnings with
 * the waive reason appended — visible to reviewers, not blocking the author.
 * The underlying status stays untouched in the persisted section state.
 */
export function displaySection(s: StatusSection): StatusSection {
  if (!s.ignored || (s.status !== "fail" && s.status !== "pending")) return s;
  return { ...s, status: "warn", message: `${s.message}\nIgnored: ${s.ignored.reason}` };
}

function escapeTableCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

/** A check row, cells pre-escaped — the table markup lives in the templates. */
function rowView(s: StatusSection): { icon: string; title: string; message: string } {
  return {
    icon: STATUS_ICONS[s.status],
    title: escapeTableCell(s.title),
    message: escapeTableCell(s.message),
  };
}

function summarizePassedSkipped(passedCount: number, skippedCount: number): string {
  if (passedCount === 0) return `${skippedCount} check${skippedCount === 1 ? "" : "s"} skipped`;
  const passed = `${passedCount} check${passedCount === 1 ? "" : "s"} passed`;
  return skippedCount === 0 ? passed : `${passed} (${skippedCount} skipped)`;
}

export function renderStatus(
  sections: StatusSection[],
  repo: string,
  target: StatusTarget = "pull_request",
  extras: StatusExtras = {},
): string {
  const slug = extras.commandSlug ?? "ha-bot";
  const blocks = extras.blocks ?? {};
  const display = sections.map(displaySection);
  const passing = display.filter((s) => s.status === "pass");
  const pending = display.filter((s) => s.status === "pending");
  const warning = display.filter((s) => s.status === "warn");
  const failing = display.filter((s) => s.status === "fail");
  const skipped = display.filter((s) => s.status === "skip");
  const visible = [...failing, ...warning, ...pending];
  const collapsed = [...passing, ...skipped];

  // The whole persisted state (raw sections with waivers, block args, and the
  // reserved data bag) round-trips as one JSON blob; the projected view above
  // is only presentation. `>` is escaped so the JSON can never contain `-->`
  // and close the HTML comment early — JSON.parse decodes `>` on read.
  const state: RuleState = {
    version: RULE_STATE_VERSION,
    sections,
    blocks,
    data: extras.data ?? {},
  };
  const persistenceTail = `${STATE_PREFIX}${JSON.stringify(state).replaceAll(">", "\\u003e")}${MARKER_SUFFIX}`;

  const applicable = commandsForTarget(extras.commands ?? [], target);

  const view = {
    friendlyName: FRIENDLY_NAMES[repo] ?? repo,
    commandSlug: slug,
    author: extras.author ?? "",
    hasCommands: applicable.length > 0,
    commands: commandViews(slug, applicable),
    hasChecks: visible.length > 0 || collapsed.length > 0,
    hasFailures: failing.length > 0,
    hasVisibleRows: visible.length > 0,
    visibleRows: visible.map(rowView),
    hasCollapsedRows: collapsed.length > 0,
    collapsedRows: collapsed.map(rowView),
    collapsedSummary: summarizePassedSkipped(passing.length, skipped.length),
    blocks,
    persistenceTail,
  };

  return renderTemplate(target === "issue" ? ISSUE_TEMPLATE : PR_TEMPLATE, view);
}

function emptyState(): RuleState {
  return { version: RULE_STATE_VERSION, sections: [], blocks: {}, data: {} };
}

/** Coerce a parsed blob into a well-formed state; garbage fields default out. */
function normalizeState(parsed: unknown): RuleState {
  const obj = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  return {
    version: typeof obj.version === "number" ? obj.version : RULE_STATE_VERSION,
    sections: Array.isArray(obj.sections) ? (obj.sections as StatusSection[]) : [],
    blocks:
      obj.blocks && typeof obj.blocks === "object" ? (obj.blocks as Record<string, unknown>) : {},
    data: obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : {},
  };
}

/**
 * The persisted state embedded in a status comment. Reads the single
 * `ha-bot-state` blob; falls back to the legacy per-marker format so waivers
 * on PRs opened before the switch survive their first re-render. Any parse
 * failure yields an empty state — the bot repopulates on the next evaluation
 * rather than throwing.
 */
export function parseState(body: string): RuleState {
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (line.startsWith(STATE_PREFIX) && line.endsWith(MARKER_SUFFIX)) {
      try {
        return normalizeState(JSON.parse(line.slice(STATE_PREFIX.length, -MARKER_SUFFIX.length)));
      } catch (err) {
        log.warn("parseState: malformed state blob", { error: String(err) });
        return emptyState();
      }
    }
  }
  const sections = parseSections(body);
  const blocks = parseBlocks(body);
  return { version: RULE_STATE_VERSION, sections, blocks, data: {} };
}

export function parseSections(body: string): StatusSection[] {
  const sections: StatusSection[] = [];
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(SECTION_PREFIX) && trimmed.endsWith(MARKER_SUFFIX)) {
      const content = trimmed.slice(SECTION_PREFIX.length, -MARKER_SUFFIX.length);
      const colonIndex = content.indexOf(":");
      if (colonIndex !== -1) {
        try {
          sections.push(JSON.parse(content.slice(colonIndex + 1)));
        } catch (err) {
          log.warn("parseSections: malformed section data", { error: String(err) });
        }
      }
    }
  }

  return sections;
}

/** The persisted block states embedded in a status comment body. */
export function parseBlocks(body: string): Record<string, unknown> {
  const blocks: Record<string, unknown> = {};
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(BLOCK_PREFIX) && trimmed.endsWith(MARKER_SUFFIX)) {
      const content = trimmed.slice(BLOCK_PREFIX.length, -MARKER_SUFFIX.length);
      const colonIndex = content.indexOf(":");
      if (colonIndex !== -1) {
        try {
          blocks[content.slice(0, colonIndex)] = JSON.parse(content.slice(colonIndex + 1));
        } catch (err) {
          log.warn("parseBlocks: malformed block data", { error: String(err) });
        }
      }
    }
  }

  return blocks;
}
