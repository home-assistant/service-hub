import { afterAll, describe, expect, it, mock } from "bun:test";
import type { Octokit } from "@octokit/rest";
import type { Env } from "../src/env.js";

// bun's mock.module is neither hoisted nor scoped to this file: register the
// mocks before importing src/index.js, and restore the real modules in
// afterAll — helpers/e2e.ts and engine/dispatch.test.ts need the originals.
const actualWebhooks = { ...(await import("@octokit/webhooks-methods")) };
const actualDispatchModule = { ...(await import("../src/engine/dispatch.js")) };

const verify = mock(async () => true);
mock.module("@octokit/webhooks-methods", () => ({ ...actualWebhooks, verify }));

const dispatch = mock(async () => undefined);
mock.module("../src/engine/dispatch.js", () => ({ ...actualDispatchModule, dispatch }));

afterAll(() => {
  mock.module("@octokit/webhooks-methods", () => actualWebhooks);
  mock.module("../src/engine/dispatch.js", () => actualDispatchModule);
});

const { createBotApp } = await import("../src/index.js");

const app = createBotApp({
  config: { repositories: {} },
  commandConfig: { repositories: {} },
  createOctokit: () => ({}) as unknown as Octokit,
});

async function fetchApp(req: Request): Promise<Response> {
  return app(req, env);
}

function makeRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/github/webhook", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": "sha256=valid",
      "x-github-event": "pull_request",
      ...headers,
    },
  });
}

const env: Env = {
  GITHUB_APP_ID: "123",
  GITHUB_PRIVATE_KEY: "key",
  GITHUB_INSTALLATION_ID: "456",
  GITHUB_WEBHOOK_SECRET: "secret",
  SENTRY_DSN: "",
  ENVIRONMENT: "test",
  BOT_SLUG: "ha-bot",
  COMMAND_SLUG: "ha-bot",
};

describe("webhook handler", () => {
  it("returns 401 for invalid signature", async () => {
    verify.mockResolvedValue(false);

    const req = makeRequest(JSON.stringify({ action: "opened" }));
    const res = await fetchApp(req);

    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Invalid signature");
  });

  it("returns 400 for invalid JSON", async () => {
    verify.mockResolvedValue(true);

    const req = makeRequest("not-json");
    const res = await fetchApp(req);

    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Invalid JSON");
  });

  it("returns 200 and skips new_permissions_accepted", async () => {
    verify.mockResolvedValue(true);
    dispatch.mockClear();

    const req = makeRequest(JSON.stringify({ action: "new_permissions_accepted" }));
    const res = await fetchApp(req);

    expect(res.status).toBe(200);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches pull request events", async () => {
    verify.mockResolvedValue(true);
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

    const req = makeRequest(JSON.stringify(payload));
    const res = await fetchApp(req);

    expect(res.status).toBe(200);
    expect(dispatch).toHaveBeenCalled();
  });

  it("short-circuits self-webhooks without dispatching", async () => {
    verify.mockResolvedValue(true);
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

    const req = makeRequest(JSON.stringify(payload));
    const res = await fetchApp(req);

    expect(res.status).toBe(200);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("matches self-webhook login case-insensitively", async () => {
    verify.mockResolvedValue(true);
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

    const req = makeRequest(JSON.stringify(payload));
    const res = await fetchApp(req);

    expect(res.status).toBe(200);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("still dispatches for other bot senders", async () => {
    verify.mockResolvedValue(true);
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

    const req = makeRequest(JSON.stringify(payload));
    const res = await fetchApp(req);

    expect(res.status).toBe(200);
    expect(dispatch).toHaveBeenCalled();
  });

  it("returns 200 for health endpoint", async () => {
    const req = new Request("http://localhost/health");
    const res = await fetchApp(req);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });
});
