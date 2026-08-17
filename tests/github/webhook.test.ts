import type { ExecutionContext } from "@nestjs/common";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import type { Octokit } from "@octokit/rest";
import { sign } from "@octokit/webhooks-methods";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../../src/env.js";
import { GithubWebhookGuard } from "../../src/github/github-webhook.guard.js";
import { WebhookService } from "../../src/github/webhook.service.js";

// vi.mock is hoisted above the imports and scoped to this file, so the mocked
// dispatch only exists here — helpers/e2e.ts and engine/dispatch.test.ts keep
// the real module.
const { dispatch } = vi.hoisted(() => ({
  dispatch: vi.fn(async () => undefined),
}));

vi.mock("../../src/github/engine/dispatch.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/github/engine/dispatch.js")>()),
  dispatch,
}));

// Routing tests never reach the API; an inert Octokit suffices.
const octokit = {} as unknown as Octokit;

const env: Env = {
  GITHUB_APP_ID: "123",
  GITHUB_PRIVATE_KEY: "key",
  GITHUB_INSTALLATION_ID: "456",
  GITHUB_WEBHOOK_SECRET: "secret",
  SENTRY_DSN: "",
  ENVIRONMENT: "test",
  BOT_SLUG: "ha-bot",
  COMMAND_SLUG: "ha-bot",
  PORT: 0,
};

const service = new WebhookService(env, octokit);

function guardContext(body: string, signature: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { "x-hub-signature-256": signature },
        rawBody: Buffer.from(body),
      }),
    }),
  } as unknown as ExecutionContext;
}

describe("webhook signature guard", () => {
  it("throws 401 for an invalid signature", async () => {
    const guard = new GithubWebhookGuard(env);

    await expect(guard.canActivate(guardContext("{}", "sha256=deadbeef"))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("throws 401 when the signature header is missing", async () => {
    const guard = new GithubWebhookGuard(env);

    await expect(guard.canActivate(guardContext("{}", ""))).rejects.toThrow(UnauthorizedException);
  });

  it("passes a valid signature through", async () => {
    const guard = new GithubWebhookGuard(env);
    const body = JSON.stringify({ action: "opened" });

    await expect(guard.canActivate(guardContext(body, await sign("secret", body)))).resolves.toBe(
      true,
    );
  });
});

describe("webhook handler", () => {
  it("rejects invalid JSON with a 400", async () => {
    await expect(service.handle("not-json", "pull_request")).rejects.toThrow(BadRequestException);
  });

  it("returns OK and skips new_permissions_accepted", async () => {
    dispatch.mockClear();

    const result = await service.handle(
      JSON.stringify({ action: "new_permissions_accepted" }),
      "pull_request",
    );

    expect(result).toBe("OK");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches pull request events", async () => {
    dispatch.mockClear();

    const payload = {
      action: "opened",
      number: 1,
      repository: {
        full_name: "home-assistant/core",
        name: "core",
        owner: { login: "home-assistant" },
      },
      sender: { login: "testuser", type: "User" },
      pull_request: { number: 1, head: { sha: "abc" } },
    };

    const result = await service.handle(JSON.stringify(payload), "pull_request");

    expect(result).toBe("OK");
    expect(dispatch).toHaveBeenCalled();
  });

  it("short-circuits self-webhooks without dispatching", async () => {
    dispatch.mockClear();

    const payload = {
      action: "labeled",
      repository: {
        full_name: "home-assistant/core",
        name: "core",
        owner: { login: "home-assistant" },
      },
      // Sender login matches `${BOT_SLUG}[bot]` — the cascade webhook from
      // the bot's own label add. Should be ignored.
      sender: { login: "ha-bot[bot]", type: "Bot" },
      pull_request: { number: 1, head: { sha: "abc" } },
    };

    const result = await service.handle(JSON.stringify(payload), "pull_request");

    expect(result).toBe("OK");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("matches self-webhook login case-insensitively", async () => {
    dispatch.mockClear();

    const payload = {
      action: "labeled",
      repository: {
        full_name: "home-assistant/core",
        name: "core",
        owner: { login: "home-assistant" },
      },
      sender: { login: "HA-Bot[Bot]", type: "Bot" },
      pull_request: { number: 1, head: { sha: "abc" } },
    };

    const result = await service.handle(JSON.stringify(payload), "pull_request");

    expect(result).toBe("OK");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("still dispatches for other bot senders", async () => {
    dispatch.mockClear();

    const payload = {
      action: "opened",
      repository: {
        full_name: "home-assistant/core",
        name: "core",
        owner: { login: "home-assistant" },
      },
      // Dependabot or any other bot should still flow through.
      sender: { login: "dependabot[bot]", type: "Bot" },
      pull_request: { number: 1, head: { sha: "abc" } },
    };

    const result = await service.handle(JSON.stringify(payload), "pull_request");

    expect(result).toBe("OK");
    expect(dispatch).toHaveBeenCalled();
  });
});
