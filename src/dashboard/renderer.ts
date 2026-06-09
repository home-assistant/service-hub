import type { DashboardSection, SectionStatus } from "./types.js";

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
  info: ":information_source:",
  skip: ":heavy_minus_sign:",
};

function escapeTableCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function renderRow(s: DashboardSection): string {
  const icon = STATUS_ICONS[s.status];
  const title = escapeTableCell(s.title);
  return `| ${icon} | ${title} | ${escapeTableCell(s.message)} |`;
}

const TABLE_HEADER = ["| Status | Check | Details |", "|--------|-------|---------|"];

function summarizePassedSkipped(passedCount: number, skippedCount: number): string {
  if (passedCount === 0) return `${skippedCount} check${skippedCount === 1 ? "" : "s"} skipped`;
  const passed = `${passedCount} check${passedCount === 1 ? "" : "s"} passed`;
  return skippedCount === 0 ? passed : `${passed} (${skippedCount} skipped)`;
}

export function renderDashboard(sections: DashboardSection[], repo: string): string {
  const friendlyName = FRIENDLY_NAMES[repo] ?? repo;
  const failing = sections.filter((s) => s.status === "fail" || s.status === "pending");
  const info = sections.filter((s) => s.status === "info");
  const passing = sections.filter((s) => s.status === "pass");
  const skipped = sections.filter((s) => s.status === "skip");
  const visible = [...failing, ...info];

  const sectionData = sections.map(
    (s) => `${SECTION_PREFIX}${s.id}:${JSON.stringify(s)}${SECTION_SUFFIX}`,
  );

  const lines: string[] = [
    SENTINEL,
    "",
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
    "If you think a check doesn't apply to your PR (or the rule is bugged), you can add the following snippet to your PR description and state a reason. This will mark the rule as exempt and let you put your PR in 'Ready for review'.",
    "",
    "```html",
    '<!-- ha-bot:ignore id="<section-id>" reason="<why>" -->',
    "```",
    "",
    "### Bot commands",
    "",
    "- `/ha-bot update`: if the bot failed to update this dashboard automatically (check the `Last updated` timestamp), write a comment with this command to reevaluate all rules again manually. This shouldn't be required often.",
    "",
    "</details>",
    "",
    "## Checks",
    "",
    failing.length > 0 ? "Things to address:" : "**✨ Everything's in order!**",
    "",
  ];

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

  lines.push("---", `<sub>Last updated: ${new Date().toISOString()}</sub>`, "", ...sectionData);

  return lines.join("\n");
}

export function parseDashboard(body: string): DashboardSection[] {
  const sections: DashboardSection[] = [];
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
          console.warn(`parseDashboard: malformed section data:`, err);
        }
      }
    }
  }

  return sections;
}

export { SENTINEL };
