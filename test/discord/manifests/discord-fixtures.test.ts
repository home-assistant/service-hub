import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadFixtures, runFixture } from "./harness.js";

/**
 * Full-pipeline snapshots from normalized Discord events: every fixture in
 * fixtures/<guild>/ is replayed through the real guild registry (routing,
 * error handling, and default acknowledgement included), with the resulting
 * effect list snapshotted — the Discord counterpart of the GitHub webhook
 * fixture suite. Capture new fixtures with `bun run capture-discord`.
 *
 * Regenerate intentionally with `bun test --update-snapshots`.
 */

const FIXTURES_ROOT = join(import.meta.dir, "fixtures");

describe("discord fixture snapshots", () => {
  const guildDirs = readdirSync(FIXTURES_ROOT).filter((dir) => !dir.startsWith("_"));
  for (const guildDir of guildDirs) {
    describe(guildDir, () => {
      for (const fixture of loadFixtures(join(FIXTURES_ROOT, guildDir))) {
        it(fixture.name, async () => {
          expect(await runFixture(fixture)).toMatchSnapshot();
        });
      }
    });
  }
});
