import type { WebhookContext } from "../context/webhook-context.js";
import type { DashboardSection } from "../dashboard/types.js";
import type { EventType } from "../github/types.js";

export interface StatusCheck {
  context: string;
  state: "success" | "failure" | "pending";
  description: string;
}

export interface RuleResult {
  labels?: string[];
  removeLabels?: string[];
  statusCheck?: StatusCheck;
  dashboard?: DashboardSection;
  comment?: string;
  requestChanges?: string;
  assignees?: string[];
  actions?: Array<(context: WebhookContext) => Promise<void>>;
}

export interface Rule {
  name: string;
  description: string;
  listens: EventType[];
  allowBots?: boolean;
  handle(context: WebhookContext): Promise<RuleResult | undefined>;
}
