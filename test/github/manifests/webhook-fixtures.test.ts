import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { stringify } from "yaml";
import { loadFixtures, runFixture } from "./harness.js";

/**
 * Full-pipeline snapshots from captured GitHub webhooks: every fixture in
 * fixtures/<repo>/ is a real delivery (see scripts/capture-webhooks.ts)
 * replayed through the real manifest registry and real effect application —
 * label loop, dashboard rendering, and command reactions included. The
 * `<name>.expected.yaml` sidecar holds the GitHub API writes the delivery
 * produces, in call order; a change to any rule that alters what the bot
 * would do for a covered delivery shows up as a diff there.
 *
 * Regenerate intentionally with `UPDATE_FIXTURES=1 npm test -- manifests`.
 */

const FIXTURES_ROOT = fileURLToPath(new URL("fixtures", import.meta.url));
const UPDATE = process.env.UPDATE_FIXTURES === "1";

describe("webhook fixture snapshots", () => {
  beforeAll(() => {
    // Pin the clock: hacktoberfest (and anything else date-driven) must not
    // flip snapshots with the calendar.
    vi.useFakeTimers({ now: new Date("2026-06-15T12:00:00Z"), toFake: ["Date"] });
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  const repoDirs = readdirSync(FIXTURES_ROOT).filter((dir) => !dir.startsWith("_"));
  for (const repoDir of repoDirs) {
    describe(repoDir, () => {
      for (const fixture of loadFixtures(join(FIXTURES_ROOT, repoDir))) {
        it(fixture.name, async () => {
          const calls = stringify(await runFixture(fixture), { lineWidth: 0 });
          const expectedPath = join(FIXTURES_ROOT, repoDir, `${fixture.name}.expected.yaml`);

          if (UPDATE) {
            writeFileSync(expectedPath, calls);
            return;
          }
          if (!existsSync(expectedPath)) {
            throw new Error(
              `No expected calls for "${fixture.name}" — generate with UPDATE_FIXTURES=1 npm test -- manifests`,
            );
          }
          expect(calls).toBe(readFileSync(expectedPath, "utf8"));
        });
      }
    });
  }
});
