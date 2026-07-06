import { afterAll, beforeAll, describe, expect, it, setSystemTime } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadFixtures, runFixture } from "./harness.js";

/**
 * Full-pipeline snapshots from captured GitHub webhooks: every fixture in
 * fixtures/<repo>/ is a real delivery (see scripts/capture-webhooks.ts)
 * replayed through the real manifest registry — label loop included, so
 * cross-rule and command→rule cascades land in the output. A change to any
 * rule that alters what the bot would do for a covered delivery shows up as
 * a snapshot diff.
 *
 * Regenerate intentionally with `bun test --update-snapshots`.
 */

const FIXTURES_ROOT = join(import.meta.dir, "fixtures");

describe("webhook fixture snapshots", () => {
  beforeAll(() => {
    // Pin the clock: hacktoberfest (and anything else date-driven) must not
    // flip snapshots with the calendar.
    setSystemTime(new Date("2026-06-15T12:00:00Z"));
  });

  afterAll(() => {
    setSystemTime();
  });

  const repoDirs = readdirSync(FIXTURES_ROOT).filter((dir) => !dir.startsWith("_"));
  for (const repoDir of repoDirs) {
    describe(repoDir, () => {
      for (const fixture of loadFixtures(join(FIXTURES_ROOT, repoDir))) {
        it(fixture.name, async () => {
          expect(await runFixture(fixture)).toMatchSnapshot();
        });
      }
    });
  }
});
