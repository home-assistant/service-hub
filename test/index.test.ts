import { verify } from "@octokit/webhooks-methods";
import { describe, expect, it, vi } from "vitest";

vi.mock("@octokit/webhooks-methods", () => ({
  verify: vi.fn(),
}));

vi.mock("@sentry/cloudflare", () => ({
  withSentry: (_opts: unknown, handler: unknown) => handler,
}));

vi.mock("../src/commands/registry.js", () => ({
  commandConfig: { repositories: {} },
  dispatchCommand: vi.fn().mockResolvedValue(false),
}));

vi.mock("../src/engine/dispatch.js", () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/manifests/index.js", () => ({
  config: { repositories: {} },
}));

vi.mock("../src/github/app.js", () => ({
  createOctokit: vi.fn().mockReturnValue({}),
}));

vi.mock("../src/engine/evaluate.js", () => ({
  evaluatePR: vi.fn().mockResolvedValue([]),
  evaluateRecentPRs: vi.fn().mockResolvedValue(undefined),
}));

import { dispatch } from "../src/engine/dispatch.js";

// Import the app — due to the withSentry mock, default export is the raw handler
const mod = await import("../src/index.js");
const rawHandler = mod.default as ExportedHandler<Record<string, unknown>>;

async function fetchApp(req: Request): Promise<Response> {
  if (!rawHandler.fetch) throw new Error("handler.fetch is undefined");
  return rawHandler.fetch(req, env, ctx);
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

const env = {
  GITHUB_APP_ID: "123",
  GITHUB_PRIVATE_KEY: "key",
  GITHUB_INSTALLATION_ID: "456",
  GITHUB_WEBHOOK_SECRET: "secret",
  SENTRY_DSN: "",
  ENVIRONMENT: "test",
  BOT_SLUG: "ha-bot",
  COMMAND_SLUG: "ha-bot",
} as Record<string, unknown>;

const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;

describe("webhook handler", () => {
  it("returns 401 for invalid signature", async () => {
    vi.mocked(verify).mockResolvedValue(false);

    const req = makeRequest(JSON.stringify({ action: "opened" }));
    const res = await fetchApp(req);

    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Invalid signature");
  });

  it("returns 400 for invalid JSON", async () => {
    vi.mocked(verify).mockResolvedValue(true);

    const req = makeRequest("not-json");
    const res = await fetchApp(req);

    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Invalid JSON");
  });

  it("returns 200 and skips new_permissions_accepted", async () => {
    vi.mocked(verify).mockResolvedValue(true);
    vi.mocked(dispatch).mockClear();

    const req = makeRequest(JSON.stringify({ action: "new_permissions_accepted" }));
    const res = await fetchApp(req);

    expect(res.status).toBe(200);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches pull request events", async () => {
    vi.mocked(verify).mockResolvedValue(true);
    vi.mocked(dispatch).mockClear();

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
    vi.mocked(verify).mockResolvedValue(true);
    vi.mocked(dispatch).mockClear();

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
    vi.mocked(verify).mockResolvedValue(true);
    vi.mocked(dispatch).mockClear();

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
    vi.mocked(verify).mockResolvedValue(true);
    vi.mocked(dispatch).mockClear();

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
