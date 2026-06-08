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
  const passing = sections.filter((s) => s.status === "pass" || s.status === "info");
  const skipped = sections.filter((s) => s.status === "skip");

  const sectionData = sections.map(
    (s) => `${SECTION_PREFIX}${s.id}:${JSON.stringify(s)}${SECTION_SUFFIX}`,
  );

  const lines: string[] = [
    SENTINEL,
    "",
    `👋 Hi! Thanks for contributing to **${friendlyName}**.`,
    "",
    "This dashboard flags anything to address before your PR can be reviewed. It updates automatically on every change, and the PR stays in draft until everything's green. Once it is, you can press the 'Ready for review' button at the bottom of the page to notify reviewers to take a look.",
    "",
    "<details><summary>Skip a check or run commands</summary>",
    "",
    "**Skip a check that doesn't apply** — add this to your PR description with a reason:",
    "",
    "```html",
    '<!-- ha-bot:ignore id="<section-id>" reason="<why>" -->',
    "```",
    "",
    "**Bot commands** — comment `/ha-bot update` to manually re-run all checks.",
    "",
    "</details>",
    "",
    "## Checks",
    "",
    failing.length > 0 ? "Things to address:" : "**✨ Everything's in order!**",
    "",
  ];

  if (failing.length > 0) {
    lines.push(...TABLE_HEADER, ...failing.map(renderRow), "");
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
