import type { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../../src/env.js";
import { requestHandler } from "../../src/github/app.js";

// vi.mock is hoisted above the imports and scoped to this file, so the mocked
// verify/dispatch only exist here — helpers/e2e.ts and engine/dispatch.test.ts
// keep the real modules.
const { verify, dispatch } = vi.hoisted(() => ({
  verify: vi.fn(async () => true),
  dispatch: vi.fn(async () => undefined),
}));

vi.mock("@octokit/webhooks-methods", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@octokit/webhooks-methods")>()),
  verify,
}));

vi.mock("../../src/github/engine/dispatch.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/github/engine/dispatch.js")>()),
  dispatch,
}));

// Routing tests never reach the API; an inert Octokit suffices.
const octokit = {} as unknown as Octokit;

async function fetchApp(req: Request): Promise<Response> {
  return requestHandler(env, octokit, req);
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
