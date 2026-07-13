import type { Octokit } from "@octokit/rest";
import { verify } from "@octokit/webhooks-methods";
import type { IssueCommentCreatedEvent } from "@octokit/webhooks-types";
import type { Env } from "../env.js";
import { isBotCommand } from "./engine/command-context.js";
import { dispatch, dispatchCommand } from "./engine/dispatch.js";
import { evaluateRecentPRs } from "./engine/evaluate.js";
import { EventType } from "./engine/event.js";
import {
  commandContextFromWebhook,
  contextFromWebhook,
  type WebhookEventPayload,
} from "./engine/model/from-webhook.js";
import { registryConfig } from "./manifests/index.js";

const CRON_LOOKBACK_OVERLAP_MIN = 2;
const KNOWN_EVENT_TYPES = new Set<string>(Object.values(EventType));

export async function webhookHandler(
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
      await dispatchCommand(
        commandContextFromWebhook(env, registryConfig, octokit, commentPayload),
      );
    }
    return new Response("OK");
  }

  await dispatch(contextFromWebhook(env, registryConfig, octokit, payload, eventType));

  return new Response("OK");
}

export async function scheduledHandler(
  env: Env,
  octokit: Octokit,
  interval_min: number,
): Promise<void> {
  const since = new Date(Date.now() - (interval_min + CRON_LOOKBACK_OVERLAP_MIN) * 60 * 1000);
  const repos = Object.keys(registryConfig.repositories);

  await Promise.allSettled(
    repos.map((repo) => evaluateRecentPRs(octokit, repo, since, env, registryConfig)),
  );
}
