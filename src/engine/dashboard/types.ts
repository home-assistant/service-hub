/**
 * `warn` renders in the checks table with a warning triangle but never fails
 * the aggregate — for conditions a reviewer should see without blocking the
 * author (member release-branch targets, contributor-waived checks).
 * `info` is contextual content, rendered outside the checks table.
 */
export type SectionStatus = "pass" | "fail" | "pending" | "warn" | "info" | "skip";

export interface DashboardSection {
  id: string;
  title: string;
  status: SectionStatus;
  message: string;
}
