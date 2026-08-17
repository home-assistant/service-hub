import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { Octokit } from "@octokit/rest";
import type { IssueCommentCreatedEvent } from "@octokit/webhooks-types";
import { ENV, type Env } from "../env.js";
import { dispatch, dispatchCommand } from "./engine/dispatch.js";
import { EventType } from "./engine/event.js";
import { commandContextFromWebhook, isBotCommand } from "./engine/model/command-context.js";
import { ruleContextFromWebhook, type WebhookEventPayload } from "./engine/model/rule-context.js";
import { registryConfig } from "./manifests/index.js";
import { OCTOKIT } from "./octokit.provider.js";
import { logRace } from "./race-monitor.js";

const KNOWN_EVENT_TYPES = new Set<string>(Object.values(EventType));

@Injectable()
export class WebhookService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(OCTOKIT) private readonly octokit: Octokit,
  ) {}

  /** Handle a signature-verified delivery (see `GithubWebhookGuard`). */
  async handle(body: string, event: string): Promise<string> {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(body);
    } catch {
      throw new BadRequestException("Invalid JSON");
    }
    const action = (raw.action as string) ?? "";
    const rawEventType = `${event}.${action}`;

    // Skip events without repository scope
    if (!raw.repository || typeof raw.repository !== "object") {
      return "OK";
    }

    const payload = raw as unknown as WebhookEventPayload;
    const known = KNOWN_EVENT_TYPES.has(rawEventType);
    const senderLogin = payload.sender?.login ?? "";
    const ownBotLogin = `${this.env.BOT_SLUG}[bot]`;
    const selfWebhook = senderLogin.toLowerCase() === ownBotLogin.toLowerCase();

    // Skip self-webhooks and events we don't have a rule for
    if (selfWebhook || !known) return "OK";

    const eventType = rawEventType as EventType;

    // Comment events are only relevant to commands
    if (eventType === EventType.ISSUE_COMMENT_CREATED) {
      const commentPayload = payload as IssueCommentCreatedEvent;
      if (isBotCommand(commentPayload.comment.body ?? "", this.env.COMMAND_SLUG)) {
        const context = commandContextFromWebhook(
          this.env,
          registryConfig,
          this.octokit,
          commentPayload,
        );
        await logRace(`${context.repo.fullName}#${context.number}`, eventType, () =>
          dispatchCommand(context),
        );
      }
      return "OK";
    }

    const context = ruleContextFromWebhook(
      this.env,
      registryConfig,
      this.octokit,
      payload,
      eventType,
    );
    await logRace(`${context.repo.fullName}#${context.number}`, eventType, () => dispatch(context));

    return "OK";
  }
}
