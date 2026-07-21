import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setMessageFileReader } from "../../../src/discord/data/messages.js";
import type { PinnedMessage } from "../../../src/discord/engine/context.js";
import { dispatchDiscordEvent } from "../../../src/discord/engine/dispatch.js";
import type { DiscordEvent } from "../../../src/discord/engine/event.js";
import type { DiscordEffect } from "../../../src/discord/engine/types.js";
import { discordRegistry } from "../../../src/discord/manifests/index.js";
import { resetDataCaches, routeFetch } from "../helpers/remote.js";

/**
 * A fixture is a normalized DiscordEvent (see scripts/capture-discord.ts)
 * named `<type>[.variant].json`. A `<name>.state.json` sidecar stubs the
 * world outside the event: remote JSON/YAML endpoints the data services
 * read, and the channel's pinned messages.
 */
export interface DiscordFixtureState {
  /** URL substring → body served by the fetch mock; other URLs 404. */
  remote?: Record<string, unknown>;
  pinned?: PinnedMessage[];
}

export interface DiscordFixture {
  name: string;
  event: DiscordEvent;
  state: DiscordFixtureState;
}

export function loadFixtures(dir: string): DiscordFixture[] {
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".json") && !file.endsWith(".state.json"))
    .sort();

  return files.map((file) => {
    const name = file.replace(/\.json$/, "");
    const event = JSON.parse(readFileSync(join(dir, file), "utf-8")) as DiscordEvent;
    let state: DiscordFixtureState = {};
    try {
      state = JSON.parse(readFileSync(join(dir, `${name}.state.json`), "utf-8"));
    } catch {
      // No sidecar — the fixture needs no world state.
    }
    return { name, event, state };
  });
}

/** Replay the event through the real guild registry and return the effects. */
export async function runFixture(fixture: DiscordFixture): Promise<DiscordEffect[]> {
  resetDataCaches();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = routeFetch(fixture.state.remote ?? {});
  // Message YAML is bundled and read from disk; serve the fixture's
  // `messages/<file>` stubs through the loader's reader seam instead.
  setMessageFileReader((file) => {
    const body = fixture.state.remote?.[`messages/${file}`];
    return typeof body === "string" ? body : "";
  });
  try {
    return await dispatchDiscordEvent(discordRegistry, fixture.event, {
      pinnedMessages: async () => fixture.state.pinned ?? [],
    });
  } finally {
    globalThis.fetch = originalFetch;
    setMessageFileReader(null);
  }
}
