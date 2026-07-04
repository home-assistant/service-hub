import { afterAll, beforeAll, describe, expect, it, setSystemTime } from "bun:test";
import { EventType } from "../../src/engine/event.js";
import { runScenario, type Scenario } from "./harness.js";

/**
 * Full-pipeline snapshots for the home-assistant/core manifest: each scenario
 * runs a realistic webhook (or command) through the real registry — including
 * the label loop, so cross-rule and command→rule cascades land in the output.
 * A change to any rule that alters what the bot would do in these situations
 * shows up as a snapshot diff. Add a scenario when a new interaction between
 * rules (or a new command) is worth pinning down.
 *
 * Regenerate intentionally with `bun test --update-snapshots`.
 */

const HUE_REMOTE = {
  "components/hue/manifest.json": {
    domain: "hue",
    name: "Philips Hue",
    quality_scale: "platinum",
    codeowners: ["@balloob"],
  },
  "analytics.home-assistant.io": { integrations: { hue: 150_000, mqtt: 90_000 } },
};

const HUE_CODEOWNERS = "homeassistant/components/hue/* @balloob\n";

const BUGFIX_BODY = [
  "## Type of change",
  "",
  "- [x] Bugfix (non-breaking change which fixes an issue)",
].join("\n");

const NEW_INTEGRATION_BODY = ["## Type of change", "", "- [x] New integration (thank you!)"].join(
  "\n",
);

const scenarios: Record<string, Scenario> = {
  "PR opened: bugfix touching one integration": {
    event: EventType.PULL_REQUEST_OPENED,
    pr: { body: BUGFIX_BODY },
    files: [
      { filename: "homeassistant/components/hue/light.py", additions: 12 },
      { filename: "tests/components/hue/test_light.py", additions: 40 },
    ],
    codeowners: HUE_CODEOWNERS,
    remote: HUE_REMOTE,
  },

  "PR opened: new integration without a docs PR": {
    event: EventType.PULL_REQUEST_OPENED,
    pr: { body: NEW_INTEGRATION_BODY },
    files: [
      { filename: "homeassistant/components/awesome/__init__.py", status: "added", additions: 80 },
      {
        filename: "homeassistant/components/awesome/manifest.json",
        status: "added",
        additions: 15,
      },
      {
        filename: "homeassistant/components/awesome/config_flow.py",
        status: "added",
        additions: 60,
      },
      { filename: "tests/components/awesome/test_config_flow.py", status: "added", additions: 90 },
    ],
    remote: {
      "components/awesome/manifest.json": {
        domain: "awesome",
        name: "Awesome",
        quality_scale: "bronze",
        codeowners: ["@newdev"],
      },
    },
  },

  "PR opened: dependency-only bump": {
    event: EventType.PULL_REQUEST_OPENED,
    pr: {
      body: "## Type of change\n\n- [x] Dependency upgrade",
      user: { login: "dependabot[bot]", type: "Bot" },
    },
    sender: { login: "dependabot[bot]", type: "Bot" },
    files: [{ filename: "requirements_all.txt", additions: 2 }],
  },

  "PR synchronized: merge conflict against base": {
    event: EventType.PULL_REQUEST_SYNCHRONIZE,
    labels: ["integration: hue", "bugfix", "has-tests"],
    pr: { body: BUGFIX_BODY },
    files: [{ filename: "homeassistant/components/hue/light.py", additions: 12 }],
    mergeableState: "dirty",
    codeowners: HUE_CODEOWNERS,
    remote: HUE_REMOTE,
  },

  "PR labeled: blocking label awaiting-frontend": {
    event: EventType.PULL_REQUEST_LABELED,
    label: "awaiting-frontend",
    labels: ["awaiting-frontend"],
    files: [{ filename: "homeassistant/components/hue/light.py", additions: 12 }],
  },

  "issue labeled with an integration: code owners get pinged": {
    event: EventType.ISSUES_LABELED,
    label: "integration: hue",
    labels: ["integration: hue"],
    issue: {},
    codeowners: HUE_CODEOWNERS,
    remote: HUE_REMOTE,
  },

  "command: code owner adds needs-more-information": {
    event: EventType.ISSUE_COMMENT_CREATED,
    comment: "/ha-bot add-label needs-more-information",
    sender: { login: "balloob", type: "User" },
    labels: ["integration: hue"],
    codeowners: HUE_CODEOWNERS,
    remote: HUE_REMOTE,
  },

  "command: code owner closes an issue": {
    event: EventType.ISSUE_COMMENT_CREATED,
    comment: "/ha-bot close",
    sender: { login: "balloob", type: "User" },
    labels: ["integration: hue"],
    issue: {},
    remote: HUE_REMOTE,
  },

  "command: non-owner is rejected": {
    event: EventType.ISSUE_COMMENT_CREATED,
    comment: "/ha-bot close",
    sender: { login: "drive-by", type: "User" },
    labels: ["integration: hue"],
    issue: {},
    remote: HUE_REMOTE,
  },
};

describe("home-assistant/core pipeline scenarios", () => {
  beforeAll(() => {
    // Pin the clock: hacktoberfest (and anything else date-driven) must not
    // flip snapshots with the calendar.
    setSystemTime(new Date("2026-06-15T12:00:00Z"));
  });

  afterAll(() => {
    setSystemTime();
  });

  for (const [name, scenario] of Object.entries(scenarios)) {
    it(name, async () => {
      expect(await runScenario(scenario)).toMatchSnapshot();
    });
  }
});
