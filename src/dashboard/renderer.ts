import type { DashboardSection, SectionStatus } from "./types.js";

const SENTINEL = "<!-- ha-bot-dashboard -->";
const SECTION_PREFIX = "<!-- section:";
const SECTION_SUFFIX = " -->";

const STATUS_ICONS: Record<SectionStatus, string> = {
  pass: ":white_check_mark:",
  fail: ":x:",
  pending: ":hourglass:",
  info: ":information_source:",
};

function escapeTableCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function renderRow(s: DashboardSection): string {
  const icon = STATUS_ICONS[s.status];
  const titleText = escapeTableCell(s.title);
  const title = s.url ? `[${titleText}](${s.url})` : titleText;
  return `| ${icon} | ${title} | ${escapeTableCell(s.message)} |`;
}

const TABLE_HEADER = ["| Status | Check | Details |", "|--------|-------|---------|"];

export function renderDashboard(sections: DashboardSection[]): string {
  const failing = sections.filter((s) => s.status === "fail" || s.status === "pending");
  const passing = sections.filter((s) => s.status === "pass" || s.status === "info");

  const sectionData = sections.map(
    (s) => `${SECTION_PREFIX}${s.id}:${JSON.stringify(s)}${SECTION_SUFFIX}`,
  );

  const lines: string[] = [SENTINEL, "", "## Pull Request Checklist", ""];

  if (failing.length > 0) {
    lines.push(...TABLE_HEADER, ...failing.map(renderRow), "");
  }

  if (passing.length > 0) {
    lines.push(
      "<details>",
      `<summary>${passing.length} check${passing.length === 1 ? "" : "s"} passed</summary>`,
      "",
      ...TABLE_HEADER,
      ...passing.map(renderRow),
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

export function mergeSections(
  existing: DashboardSection[],
  updates: DashboardSection[],
): DashboardSection[] {
  const merged = new Map<string, DashboardSection>();
  for (const s of existing) {
    merged.set(s.id, s);
  }
  for (const s of updates) {
    merged.set(s.id, s);
  }
  return Array.from(merged.values());
}

export { SENTINEL };
