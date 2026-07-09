import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadFixtures, runFixture } from "./harness.js";

/**
 * Full-pipeline snapshots from normalized Discord events: every fixture in
 * fixtures/<guild>/ is replayed through the real guild registry (routing,
 * error handling, and default acknowledgement included), with the resulting
 * effect list snapshotted — the Discord counterpart of the GitHub webhook
 * fixture suite. Capture new fixtures with `npm run capture-discord`.
 *
 * Regenerate intentionally with `npm test -- -u`.
 */

const FIXTURES_ROOT = fileURLToPath(new URL("fixtures", import.meta.url));

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
