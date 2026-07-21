import type { EventType } from "./event.js";
import type { RuleContext } from "./model/rule-context.js";
import type { SectionStatus, StatusSection } from "./status/types.js";
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
  /** Status section ID; doubles as the rule name. */
  id: string;
  title: string;
  description: string;
  events: readonly E[];
  evaluate: (ctx: RuleContext<E>) => Promise<CheckOutcome | undefined>;
  allowBots?: boolean;
  /**
   * Target state this check runs in. Outside it, `evaluate` isn't called and
   * nothing is emitted and the dashboard keeps its last rows. Defaults to
   * "open": label/edit events and ON_DEMAND also fire on closed/merged
   * targets, and a check must not fail, draft, or re-status those. "always"
   * hands state handling to `evaluate` itself.
   */
  runOn?: "open" | "closed" | "always";
}

/**
 * A rule whose job is one status row. The factory owns the envelope —
 * section ID, `statusSections` claim, event registration — so the rule
 * body only computes an outcome. Returning undefined emits nothing (e.g.
 * while GitHub is still computing the state the check reads); a check whose
 * subject doesn't apply reports `skip`.
 */
export function check<E extends EventType>(config: CheckConfig<E>): Rule {
  const runOn = config.runOn ?? "open";
  const handler: EventHandler<E> = async (ctx) => {
    if (runOn !== "always" && (await ctx.target.state()) !== runOn) return undefined;

    const outcome = await config.evaluate(ctx);
    if (!outcome) return undefined;
    const section: StatusSection = {
      id: config.id,
      title: config.title,
      status: outcome.status,
      message: outcome.message,
    };
    return [...(outcome.effects ?? []), { type: "statusSection", section }];
  };

  return {
    name: config.id,
    description: config.description,
    allowBots: config.allowBots,
    statusSections: [{ id: config.id, title: config.title }],
    events: on(config.events, handler),
  };
}
