import { log } from "../../../log.js";
import { type CommandHelpEntry, commandHelpLines, commandsForTarget } from "./help.js";
import type { SectionStatus, StatusSection } from "./types.js";

// The sentinel identifies the bot's status comment among all issue comments;
// section state round-trips through the HTML comments at the comment's tail.
// Marker strings predate the dashboard → status rename and must stay stable:
// deployed comments carry them.
const SENTINEL = "<!-- ha-bot-dashboard -->";
const SECTION_PREFIX = "<!-- section:";
const SECTION_SUFFIX = " -->";

const FRIENDLY_NAMES: Record<string, string> = {
  "home-assistant/core": "Home Assistant",
  "justanotherariel/hass_core": "Home Assistant",
};

const STATUS_ICONS: Record<SectionStatus, string> = {
  pass: ":white_check_mark:",
  fail: ":x:",
  pending: ":hourglass:",
  warn: ":warning:",
  info: ":information_source:",
  skip: ":heavy_minus_sign:",
};

export type StatusTarget = "pull_request" | "issue";

/** Repo/dispatch details the renderer weaves into the boilerplate. */
export interface StatusExtras {
  /** Target author login, mentioned in the issue greeting. */
  author?: string;
  /** Comment-command prefix; defaults to `ha-bot`. */
  commandSlug?: string;
  /** The repo's registered commands, listed in the collapsed help. */
  commands?: readonly CommandHelpEntry[];
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

function renderRow(s: StatusSection): string {
  const icon = STATUS_ICONS[s.status];
  const title = escapeTableCell(s.title);
  return `| ${icon} | ${title} | ${escapeTableCell(s.message)} |`;
}

function renderContextItem(s: StatusSection): string {
  return `**${s.title}**\n\n${s.message}`;
}

const TABLE_HEADER = ["| Status | Check | Details |", "|--------|-------|---------|"];

function commandList(
  slug: string,
  commands: readonly CommandHelpEntry[],
  target: StatusTarget,
): string[] {
  const applicable = commandsForTarget(commands, target);
  if (applicable.length === 0) return [];
  return [
    `Reply with \`/${slug} <command>\` — several commands can be stacked, one per line:`,
    "",
    ...commandHelpLines(slug, applicable),
  ];
}

function summarizePassedSkipped(passedCount: number, skippedCount: number): string {
  if (passedCount === 0) return `${skippedCount} check${skippedCount === 1 ? "" : "s"} skipped`;
  const passed = `${passedCount} check${passedCount === 1 ? "" : "s"} passed`;
  return skippedCount === 0 ? passed : `${passed} (${skippedCount} skipped)`;
}

function prIntro(friendlyName: string, slug: string, extras: StatusExtras): string[] {
  return [
    `👋 Hi! Thanks for contributing to **${friendlyName}**.`,
    "",
    "This is your PR dashboard which flags anything you need to address before your PR can be reviewed. Once everything is green, you can press the **'Ready for review'** button at the bottom of the page to notify reviewers to take a look.",
    "",
    "<details><summary>More information about this dashboard</summary>",
    "",
    "This dashboard automatically updates on every change to this PR and reevaluates the rules as you go. Until everything has been addressed, the PR stays in draft and you won't be able to put it into review.",
    "",
    "### Skip a check that doesn't apply",
    "",
    `If you think a check doesn't apply to your PR (or the rule is bugged), comment \`/${slug} ignore "<check name>" "<reason>"\` — the check name as shown in the table above. This will mark the check as ignored and let you put your PR in 'Ready for review'; \`/${slug} unignore "<check name>"\` restores it.`,
    "",
    "### Bot commands",
    "",
    ...commandList(slug, extras.commands ?? [], "pull_request"),
    "",
    "</details>",
  ];
}

function issueIntro(friendlyName: string, extras: StatusExtras): string[] {
  const greeting = extras.author ? `👋 Hi @${extras.author}!` : "👋 Hi!";
  return [
    `${greeting} Thanks for reporting an issue to **${friendlyName}**.`,
    "",
    "Before we dive in, please make sure this isn't a duplicate by searching through existing issues. Also check recently closed issues, as your problem might already be fixed but not yet released.",
  ];
}

function issueCommandHelp(slug: string, extras: StatusExtras): string[] {
  const list = commandList(slug, extras.commands ?? [], "issue");
  if (list.length === 0) return [];
  return ["<details><summary>Bot commands</summary>", "", ...list, "", "</details>", ""];
}

export function renderStatus(
  sections: StatusSection[],
  repo: string,
  target: StatusTarget = "pull_request",
  extras: StatusExtras = {},
): string {
  const friendlyName = FRIENDLY_NAMES[repo] ?? repo;
  const slug = extras.commandSlug ?? "ha-bot";
  const display = sections.map(displaySection);
  const failing = display.filter((s) => s.status === "fail");
  const pending = display.filter((s) => s.status === "pending");
  const warning = display.filter((s) => s.status === "warn");
  const info = display.filter((s) => s.status === "info");
  const passing = display.filter((s) => s.status === "pass");
  const skipped = display.filter((s) => s.status === "skip");
  const visible = [...failing, ...pending, ...warning];
  const hasChecks = visible.length > 0 || passing.length > 0 || skipped.length > 0;

  // Raw sections (waivers included) are what round-trips; the projected view
  // above is only presentation.
  const sectionData = sections.map(
    (s) => `${SECTION_PREFIX}${s.id}:${JSON.stringify(s)}${SECTION_SUFFIX}`,
  );

  const lines: string[] = [
    SENTINEL,
    "",
    ...(target === "issue"
      ? issueIntro(friendlyName, extras)
      : prIntro(friendlyName, slug, extras)),
    "",
  ];

  if (hasChecks) {
    lines.push(
      "## Checks",
      "",
      failing.length > 0 ? "Things to address:" : "**✨ Everything's in order!**",
      "",
    );

    if (visible.length > 0) {
      lines.push(...TABLE_HEADER, ...visible.map(renderRow), "");
    }

    if (passing.length > 0 || skipped.length > 0) {
      lines.push(
        "<details>",
        `<summary>${summarizePassedSkipped(passing.length, skipped.length)}</summary>`,
        "",
        ...TABLE_HEADER,
        ...passing.map(renderRow),
        ...skipped.map(renderRow),
        "",
        "</details>",
        "",
      );
    }
  }

  if (info.length > 0) {
    lines.push("## Context", "", info.map(renderContextItem).join("\n\n"), "");
  }

  if (target === "issue") {
    lines.push(...issueCommandHelp(slug, extras));
  }

  const now = extras.now ?? new Date();
  lines.push("---", `<sub>Last updated: ${now.toISOString()}</sub>`, "", ...sectionData);

  return lines.join("\n");
}

export function parseSections(body: string): StatusSection[] {
  const sections: StatusSection[] = [];
  const lines = body.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(SECTION_PREFIX) && trimmed.endsWith(SECTION_SUFFIX)) {
      const content = trimmed.slice(SECTION_PREFIX.length, -SECTION_SUFFIX.length);
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
