import type { Octokit } from "@octokit/rest";
import { sign } from "@octokit/webhooks-methods";
import type { Env } from "../../../src/env.js";
import { ghWebhookHandler } from "../../../src/github/app.js";
import type { RegistryConfig } from "../../../src/github/engine/dispatch.js";
import { createMockGitHub, type MockGitHub } from "./mock-context.js";

const TEST_SECRET = "test-webhook-secret";

const EMPTY_REGISTRY: RegistryConfig = { repositories: {} };

/**
 * app.ts imports its registry itself, so the test file must install a module
 * mock over manifests/index.js that reads from this mutable wiring object
 * (see e2e.test.ts); each harness points it at the test's registry. The
 * Octokit is an ordinary parameter and needs no mock plumbing.
 */
export interface E2EWiring {
  config: RegistryConfig;
}

export interface E2EHarnessOptions {
  config?: RegistryConfig;
}

export interface E2EHarness {
  github: MockGitHub;
  deliver(event: string, payload: object): Promise<Response>;
  /** Send a request with a bad signature for the unhappy path. */
  deliverUnsigned(event: string, payload: object): Promise<Response>;
}

/**
 * Wire the registry mock and a mock Octokit, then provide a
 * `deliver(event, payload)` helper that POSTs a signed webhook through the
 * real signature-verification + dispatch pipeline.
 *
 * Modeled on Probot's `probot.receive({ name, payload })` — but assertions
 * happen against the captured Octokit mock rather than nock interceptors.
 */
export function createE2EHarness(wiring: E2EWiring, options: E2EHarnessOptions = {}): E2EHarness {
  const github = createMockGitHub();
  const octokit = github as unknown as Octokit;
  wiring.config = options.config ?? EMPTY_REGISTRY;

  const env = {
    GITHUB_APP_ID: "1",
    GITHUB_PRIVATE_KEY: "test-key",
    GITHUB_INSTALLATION_ID: "1",
    GITHUB_WEBHOOK_SECRET: TEST_SECRET,
    BOT_SLUG: "ha-bot",
    COMMAND_SLUG: "ha-bot",
    SENTRY_DSN: "",
    ENVIRONMENT: "test",
  } as unknown as Env;

  return {
    github,
    deliver: async (event, payload) => {
      const body = JSON.stringify(payload);
      const signature = await sign(TEST_SECRET, body);
      const req = new Request("http://localhost/github/webhook", {
        method: "POST",
        body,
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": signature,
          "x-github-event": event,
        },
      });
      return ghWebhookHandler(env, octokit, req);
    },
    deliverUnsigned: async (event, payload) => {
      const req = new Request("http://localhost/github/webhook", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": "sha256=deadbeef",
          "x-github-event": event,
        },
      });
      return ghWebhookHandler(env, octokit, req);
    },
  };
}

/**
 * Minimal pull_request.opened payload. Tests override fields they need.
 */
export function prOpenedPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: "opened",
    number: 1,
    sender: { login: "testuser", type: "User" },
    repository: {
      full_name: "home-assistant/core",
      name: "core",
      owner: { login: "home-assistant" },
    },
    pull_request: {
      number: 1,
      node_id: "PR_1",
      head: { sha: "abc123" },
      base: { ref: "dev" },
      labels: [],
      body: "",
      user: { login: "testuser" },
    },
    ...overrides,
  };
}

/**
 * Minimal issue_comment.created payload with a PR-linked issue.
 */
export function commentPayload(
  body: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    action: "created",
    sender: { login: "testuser", type: "User" },
    repository: {
      full_name: "home-assistant/core",
      name: "core",
      owner: { login: "home-assistant" },
    },
    issue: {
      number: 1,
      pull_request: { url: "https://api.github.com/repos/home-assistant/core/pulls/1" },
      user: { login: "testuser" },
      body: "",
    },
    comment: {
      id: 42,
      body,
      user: { login: "testuser" },
    },
    ...overrides,
  };
}
