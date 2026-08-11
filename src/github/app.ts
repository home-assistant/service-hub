import type { Octokit } from "@octokit/rest";
import { verify } from "@octokit/webhooks-methods";
import type { IssueCommentCreatedEvent } from "@octokit/webhooks-types";
import type { Env } from "../env.js";
import { dispatch, dispatchCommand } from "./engine/dispatch.js";
import { EventType } from "./engine/event.js";
import { commandContextFromWebhook, isBotCommand } from "./engine/model/command-context.js";
import { ruleContextFromWebhook, type WebhookEventPayload } from "./engine/model/rule-context.js";
import { registryConfig } from "./manifests/index.js";
import { logRace } from "./race-monitor.js";

const KNOWN_EVENT_TYPES = new Set<string>(Object.values(EventType));

export async function ghWebhookHandler(
  env: Env,
  octokit: Octokit,
  request: Request,
): Promise<Response> {
  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256") ?? "";

  if (!(await verify(env.GITHUB_WEBHOOK_SECRET, body, signature))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const event = request.headers.get("x-github-event") ?? "";
  const action = (raw.action as string) ?? "";
  const rawEventType = `${event}.${action}`;

  // Skip events without repository scope
  if (!raw.repository || typeof raw.repository !== "object") {
    return new Response("OK");
  }

  const payload = raw as unknown as WebhookEventPayload;
  const known = KNOWN_EVENT_TYPES.has(rawEventType);
  const senderLogin = payload.sender?.login ?? "";
  const ownBotLogin = `${env.BOT_SLUG}[bot]`;
  const selfWebhook = senderLogin.toLowerCase() === ownBotLogin.toLowerCase();

  // Skip self-webhooks and events we don't have a rule for
  if (selfWebhook || !known) return new Response("OK");

  const eventType = rawEventType as EventType;

  // Comment events are only relevant to commands
  if (eventType === EventType.ISSUE_COMMENT_CREATED) {
    const commentPayload = payload as IssueCommentCreatedEvent;
    if (isBotCommand(commentPayload.comment.body ?? "", env.COMMAND_SLUG)) {
      const context = commandContextFromWebhook(env, registryConfig, octokit, commentPayload);
      await logRace(`${context.repo.fullName}#${context.number}`, eventType, () =>
        dispatchCommand(context),
      );
    }
    return new Response("OK");
  }

  const context = ruleContextFromWebhook(env, registryConfig, octokit, payload, eventType);
  await logRace(`${context.repo.fullName}#${context.number}`, eventType, () =>
    dispatch(context),
  );

  return new Response("OK");
}
