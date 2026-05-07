export type SectionStatus = "pass" | "fail" | "pending" | "info";

export interface DashboardSection {
  id: string;
  title: string;
  status: SectionStatus;
  message: string;
  url?: string;
}
