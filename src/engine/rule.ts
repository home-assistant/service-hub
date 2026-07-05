import type { DashboardSection, SectionStatus } from "./dashboard/types.js";
import type { EventType } from "./event.js";
import type { RuleContext } from "./rule-context.js";
import type { Effect, EventHandler, EventHandlers, Rule } from "./types.js";

/**
 * Register one handler for several events, so a rule declares its event list
 * once instead of one `[EventType.X]: handler` line per event.
 */
export function on<E extends EventType>(
  events: readonly E[],
  handler: EventHandler<E>,
): EventHandlers {
  const handlers: Record<string, EventHandler<E>> = {};
  for (const event of events) handlers[event] = handler;
  return handlers as EventHandlers;
}

/**
 * What one evaluation of a check concluded. `effects` carries anything the
 * check wants applied alongside its dashboard row (labels, comments, …).
 */
export interface CheckOutcome {
  status: SectionStatus;
  message: string;
  effects?: Effect[];
}

export interface CheckConfig<E extends EventType> {
  /** Dashboard section ID; also the rule name unless `name` overrides it. */
  id: string;
  title: string;
  description: string;
  events: readonly E[];
  evaluate: (ctx: RuleContext<E>) => Promise<CheckOutcome | "clear" | undefined>;
  name?: string;
  allowBots?: boolean;
}

/**
 * A rule whose job is one dashboard row. The factory owns the envelope —
 * section ID, `dashboardSections` claim, event registration — so the rule
 * body only computes an outcome. Returning undefined emits nothing (e.g.
 * while GitHub is still computing the state the check reads); returning
 * "clear" removes the rule's section from the dashboard (the state the
 * section described no longer exists).
 */
export function check<E extends EventType>(config: CheckConfig<E>): Rule {
  const handler: EventHandler<E> = async (ctx) => {
    const outcome = await config.evaluate(ctx);
    if (!outcome) return undefined;
    if (outcome === "clear") return [{ type: "removeDashboardSection", id: config.id }];
    const section: DashboardSection = {
      id: config.id,
      title: config.title,
      status: outcome.status,
      message: outcome.message,
    };
    return [...(outcome.effects ?? []), { type: "dashboardSection", section }];
  };

  return {
    name: config.name ?? config.id,
    description: config.description,
    allowBots: config.allowBots,
    dashboardSections: [config.id],
    events: on(config.events, handler),
  };
}
