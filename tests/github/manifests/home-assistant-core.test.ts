import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { stringify } from "yaml";
import { EventType } from "../../../src/github/engine/event.js";
import {
  commentPayload,
  issuePayload,
  prBody,
  prPayload,
  runScenario,
  type Scenario,
  TYPE_OF_CHANGE,
} from "./harness.js";

/**
 * Full-pipeline snapshots for the home-assistant/core manifest: each scenario
 * is a webhook delivery built from the baseline payloads in harness.ts,
 * dispatched against the real registry, with the effect list snapshotted.
 * Every run also asserts label independence (see runScenario).
 *
 * Snapshots live in snapshots/home-assistant-core/; update them with
 * `pnpm test -u` after an intentional behavior change.
 */

const HUE_MANIFEST = {
  domain: "hue",
  name: "Philips Hue",
  quality_scale: "platinum",
  codeowners: ["@balloob"],
};

const AWESOME_MANIFEST = {
  domain: "awesome",
  name: "Awesome",
  quality_scale: "bronze",
  codeowners: ["@newdev"],
};

const ANALYTICS = { integrations: { hue: 150000, mqtt: 90000 } };

const HUE_CODEOWNERS = "homeassistant/components/hue/* @balloob\n";

const HUE_FILES = [
  { filename: "homeassistant/components/hue/light.py", additions: 12 },
  { filename: "tests/components/hue/test_light.py", additions: 40 },
];

const AWESOME_FILES = [
  { filename: "homeassistant/components/awesome/__init__.py", status: "added", additions: 80 },
  { filename: "homeassistant/components/awesome/manifest.json", status: "added", additions: 15 },
  { filename: "homeassistant/components/awesome/config_flow.py", status: "added", additions: 60 },
  { filename: "tests/components/awesome/test_config_flow.py", status: "added", additions: 90 },
];

/** The usual world: a hue PR against the platinum hue integration. */
const HUE_STATE = {
  files: HUE_FILES,
  codeowners: HUE_CODEOWNERS,
  remote: {
    "components/hue/manifest.json": HUE_MANIFEST,
    "analytics.home-assistant.io": ANALYTICS,
  },
};

const scenarios: Record<string, Scenario> = {
  "pull_request.opened.bugfix-single-integration": {
    eventType: EventType.PULL_REQUEST_OPENED,
    payload: prPayload("opened"),
    state: HUE_STATE,
  },

  "pull_request.opened.all-change-types": {
    eventType: EventType.PULL_REQUEST_OPENED,
    payload: prPayload("opened", {
      number: 25,
      title: "All change types (template coverage)",
      body: prBody({
        checked: Object.keys(TYPE_OF_CHANGE),
        text: "One PR ticking every type-of-change box.",
      }),
    }),
    state: {
      files: AWESOME_FILES,
      codeowners: HUE_CODEOWNERS,
      remote: { "components/awesome/manifest.json": AWESOME_MANIFEST },
    },
  },

  "pull_request.opened.dependency-bump": {
    eventType: EventType.PULL_REQUEST_OPENED,
    payload: prPayload("opened", {
      number: 24,
      title: "Bump aiohttp to 3.99.0",
      body: prBody({ checked: ["dependency"], text: "Bump aiohttp to 3.99.0." }),
    }),
    state: { files: [{ filename: "requirements_all.txt", additions: 2 }] },
  },

  "pull_request.opened.new-integration-no-docs": {
    eventType: EventType.PULL_REQUEST_OPENED,
    payload: prPayload("opened", {
      number: 22,
      title: "Add Awesome Device integration",
      body: prBody({
        checked: ["new-integration"],
        text: "Adds an integration for the Awesome Device.",
      }),
    }),
    state: {
      files: AWESOME_FILES,
      codeowners: HUE_CODEOWNERS,
      remote: { "components/awesome/manifest.json": AWESOME_MANIFEST },
    },
  },

  "pull_request.edited.body-updated": {
    eventType: EventType.PULL_REQUEST_EDITED,
    payload: prPayload("edited", {
      labels: ["integration: hue"],
      body: prBody({ checked: ["bugfix", "code-quality"] }),
    }),
    state: HUE_STATE,
  },

  "pull_request.labeled.integration-hue": {
    eventType: EventType.PULL_REQUEST_LABELED,
    payload: prPayload(
      "labeled",
      { labels: ["integration: hue"] },
      { label: { name: "integration: hue" } },
    ),
    state: HUE_STATE,
  },

  "pull_request.labeled.blocking-awaiting-frontend": {
    eventType: EventType.PULL_REQUEST_LABELED,
    payload: prPayload(
      "labeled",
      { labels: ["integration: hue", "awaiting-frontend"] },
      { label: { name: "awaiting-frontend" } },
    ),
  },

  "pull_request.unlabeled.awaiting-frontend": {
    eventType: EventType.PULL_REQUEST_UNLABELED,
    payload: prPayload(
      "unlabeled",
      { labels: ["integration: hue"] },
      { label: { name: "awaiting-frontend" } },
    ),
  },

  "pull_request.synchronize.merge-conflict": {
    eventType: EventType.PULL_REQUEST_SYNCHRONIZE,
    payload: prPayload("synchronize", { labels: ["integration: hue"] }),
    state: {
      ...HUE_STATE,
      files: [{ filename: "homeassistant/components/hue/light.py", additions: 12 }],
      mergeableState: "dirty",
    },
  },

  "pull_request.reopened": {
    eventType: EventType.PULL_REQUEST_REOPENED,
    payload: prPayload("reopened", {
      labels: ["integration: hue"],
      body: prBody({ checked: ["bugfix", "code-quality"] }),
    }),
    state: {
      remote: {
        "components/hue/manifest.json": HUE_MANIFEST,
        "analytics.home-assistant.io": ANALYTICS,
      },
    },
  },

  "pull_request.ready_for_review": {
    eventType: EventType.PULL_REQUEST_READY_FOR_REVIEW,
    payload: prPayload("ready_for_review", {
      labels: ["integration: hue"],
      body: prBody({ checked: ["bugfix", "code-quality"] }),
    }),
  },

  "pull_request.closed": {
    eventType: EventType.PULL_REQUEST_CLOSED,
    payload: prPayload("closed", {
      labels: ["integration: hue"],
      state: "closed",
      body: prBody({ checked: ["bugfix", "code-quality"] }),
    }),
  },

  "pull_request_review.submitted.comment": {
    eventType: EventType.PULL_REQUEST_REVIEW_SUBMITTED,
    payload: prPayload(
      "submitted",
      {
        labels: ["integration: hue"],
        body: prBody({ checked: ["bugfix", "code-quality"] }),
      },
      { review: { state: "commented", user: { login: "reviewer" }, body: "Looks reasonable." } },
    ),
    state: {
      remote: {
        "components/hue/manifest.json": HUE_MANIFEST,
        "analytics.home-assistant.io": ANALYTICS,
      },
    },
  },

  "issues.opened": {
    eventType: EventType.ISSUES_OPENED,
    payload: issuePayload("opened"),
  },

  "issues.labeled.integration-hue": {
    eventType: EventType.ISSUES_LABELED,
    payload: issuePayload(
      "labeled",
      { labels: ["integration: hue"] },
      { label: { name: "integration: hue" } },
    ),
    state: {
      codeowners: HUE_CODEOWNERS,
      remote: {
        "components/hue/manifest.json": HUE_MANIFEST,
        "analytics.home-assistant.io": ANALYTICS,
      },
    },
  },

  "issue_comment.created.regular-comment": {
    eventType: EventType.ISSUE_COMMENT_CREATED,
    payload: commentPayload("Thanks — I can reproduce this on my bridge as well.", {
      labels: ["integration: hue"],
    }),
  },

  "issue_comment.created.command-add-label": {
    eventType: EventType.ISSUE_COMMENT_CREATED,
    payload: commentPayload('/ha-bot add-label "needs-more-information"', {
      labels: ["integration: hue"],
    }),
    state: {
      codeowners: "/homeassistant/components/hue/ @contributor\n",
      remote: {
        "components/hue/manifest.json": { ...HUE_MANIFEST, codeowners: ["@contributor"] },
      },
    },
  },

  "issue_comment.created.command-close": {
    eventType: EventType.ISSUE_COMMENT_CREATED,
    payload: commentPayload("/ha-bot close", {
      number: 23,
      title: "Hue lights become unavailable after bridge firmware update",
      body: "After the latest bridge firmware update, all hue lights drop out after a few hours.",
      pull_request: undefined,
      labels: ["integration: hue"],
    }),
    state: { codeowners: "/homeassistant/components/hue/ @contributor\n" },
  },

  "issue_comment.created.command-close-rejected": {
    eventType: EventType.ISSUE_COMMENT_CREATED,
    payload: commentPayload("/ha-bot close", {
      number: 23,
      title: "Hue lights become unavailable after bridge firmware update",
      body: "After the latest bridge firmware update, all hue lights drop out after a few hours.",
      pull_request: undefined,
      labels: ["integration: hue"],
    }),
    state: { codeowners: "/homeassistant/components/hue/ @balloob\n" },
  },
};

describe("home-assistant/core dispatch snapshots", () => {
  beforeAll(() => {
    // Pin the clock: hacktoberfest (and anything else date-driven) must not
    // flip snapshots with the calendar.
    vi.useFakeTimers({ now: new Date("2026-06-15T12:00:00Z"), toFake: ["Date"] });
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  for (const [name, scenario] of Object.entries(scenarios)) {
    it(name, async () => {
      const effects = await runScenario(scenario);
      await expect(stringify(effects, { lineWidth: 0 })).toMatchFileSnapshot(
        `snapshots/home-assistant-core/${name}.yaml`,
      );
    });
  }
});
