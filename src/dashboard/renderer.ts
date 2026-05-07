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

export function renderDashboard(sections: DashboardSection[]): string {
  const rows = sections.map((s) => {
    const icon = STATUS_ICONS[s.status];
    const title = s.url ? `[${s.title}](${s.url})` : s.title;
    return `| ${icon} | ${title} | ${s.message} |`;
  });

  const sectionData = sections.map(
    (s) => `${SECTION_PREFIX}${s.id}:${JSON.stringify(s)}${SECTION_SUFFIX}`,
  );

  return [
    SENTINEL,
    "",
    "## Pull Request Checklist",
    "",
    "| Status | Check | Details |",
    "|--------|-------|---------|",
    ...rows,
    "",
    "---",
    `<sub>Last updated: ${new Date().toISOString()}</sub>`,
    "",
    ...sectionData,
  ].join("\n");
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
        } catch {
          // Skip malformed section data
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
