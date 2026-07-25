import { describe, expect, it } from "vitest";
import { versions } from "../../../src/discord/commands/versions.js";
import { CommandContext } from "../../../src/discord/engine/context.js";
import { commandEvent, stubReader } from "../helpers/events.js";
import { withRemote } from "../helpers/remote.js";

const REMOTE = {
  "version.home-assistant.io/stable.json": {
    homeassistant: { default: "2026.7.1" },
    hassos: { ova: "16.1" },
    supervisor: "2026.06.0",
  },
  "version.home-assistant.io/beta.json": {
    homeassistant: { default: "2026.8.0b1" },
    hassos: { ova: "16.2.rc1" },
    supervisor: "2026.07.0",
  },
};

describe("/versions", () => {
  it("renders stable and beta versions side by side", async () => {
    const context = new CommandContext(commandEvent("versions"), stubReader());
    expect(await withRemote(REMOTE, () => versions.handle(context))).toEqual([
      {
        type: "reply",
        embeds: [
          {
            fields: [
              { name: "Core stable", value: "2026.7.1", inline: true },
              { name: "Core beta", value: "2026.8.0b1", inline: true },
              { name: "OS stable", value: "16.1", inline: true },
              { name: "OS beta", value: "16.2.rc1", inline: true },
              { name: "Supervisor stable", value: "2026.06.0", inline: true },
              { name: "Supervisor beta", value: "2026.07.0", inline: true },
            ],
          },
        ],
      },
    ]);
  });
});
