import { log } from "../../../log.js";
import type { BlockStates } from "./blocks.js";
import { type CommandHelpEntry, commandsForTarget, commandViews } from "./help.js";
import { loadTemplate, renderTemplate } from "./template.js";
import type { SectionStatus, StatusSection } from "./types.js";

// The sentinel identifies the bot's status comment among all issue comments;
// section state round-trips through the HTML comments at the comment's tail.
// Marker strings predate the dashboard → status rename and must stay stable:
// deployed comments carry them.
const SENTINEL = "<!-- ha-bot-dashboard -->";
const SECTION_PREFIX = "<!-- section:";
const BLOCK_PREFIX = "<!-- block:";
const MARKER_SUFFIX = " -->";

const FRIENDLY_NAMES: Record<string, string> = {
  "home-assistant/core": "Home Assistant",
  "justanotherariel/hass_core": "Home Assistant", // TODO: Remove this
};

const STATUS_ICONS: Record<SectionStatus, string> = {
  pass: ":white_check_mark:",
  fail: ":x:",
  pending: ":hourglass:",
  warn: ":warning:",
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
  /** "Last updated" timestamp; injectable for deterministic rendering. */
  now?: Date;
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
  const failing = display.filter((s) => s.status === "fail");
  const pending = display.filter((s) => s.status === "pending");
  const warning = display.filter((s) => s.status === "warn");
  const passing = display.filter((s) => s.status === "pass");
  const skipped = display.filter((s) => s.status === "skip");
  const visible = [...failing, ...pending, ...warning];
  const collapsed = [...passing, ...skipped];

  // Raw sections (waivers included) and block args are what round-trips; the
  // projected view above is only presentation.
  const persistenceTail = [
    ...sections.map((s) => `${SECTION_PREFIX}${s.id}:${JSON.stringify(s)}${MARKER_SUFFIX}`),
    ...Object.entries(blocks).map(
      ([id, args]) => `${BLOCK_PREFIX}${id}:${JSON.stringify(args)}${MARKER_SUFFIX}`,
    ),
  ].join("\n");

  const applicable = commandsForTarget(extras.commands ?? [], target);
  const now = extras.now ?? new Date();

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
    lastUpdated: now.toISOString(),
    persistenceTail,
  };

  return renderTemplate(target === "issue" ? ISSUE_TEMPLATE : PR_TEMPLATE, view);
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
