import { beforeEach, describe, expect, it } from "vitest";
import { integration } from "../../../src/discord/commands/integration.js";
import { CommandContext, DiscordContext } from "../../../src/discord/engine/context.js";
import type { Embed } from "../../../src/discord/engine/types.js";
import { autocompleteEvent, channel, commandEvent, stubReader } from "../helpers/events.js";
import { resetDataCaches, withRemote } from "../helpers/remote.js";

const HUE = {
  hue: {
    title: "Philips Hue",
    description: "Instructions on setting up Philips Hue",
    quality_scale: "platinum",
    iot_class: "local_push",
    integration_type: "hub",
  },
};

const BETA_CHANNEL = channel({ id: "427516175237382144", name: "beta" });

function embedOf(effects: unknown): Embed {
  const [effect] = effects as [{ embeds: Embed[] }];
  return effect.embeds[0];
}

beforeEach(resetDataCaches);

describe("/integration", () => {
  it("renders the integration embed from the stable index", async () => {
    const context = new CommandContext(
      commandEvent("integration", { integration: "hue" }),
      stubReader(),
    );
    const effects = await withRemote({ "www.home-assistant.io/integrations.json": HUE }, () =>
      integration.handle(context),
    );
    const embed = embedOf(effects);
    expect(embed.title).toBe("Philips Hue");
    expect(embed.thumbnail).toBe("https://brands.home-assistant.io/hue/dark_logo.png");
    expect(embed.fields?.map((f) => f.name)).toEqual([
      "Documentation",
      "Quality scale",
      "IoT Class",
      "Integration type",
      "Source",
      "Issues",
    ]);
    expect(embed.fields?.[0].value).toContain("https://www.home-assistant.io/integrations/hue/");
    expect(embed.fields?.[1].value).toContain(":trophy: Platinum");
  });

  it("serves the beta channel from the rc index", async () => {
    const context = new CommandContext(
      commandEvent("integration", { integration: "hue" }, { channel: BETA_CHANNEL }),
      stubReader(),
    );
    const effects = await withRemote({ "rc.home-assistant.io/integrations.json": HUE }, () =>
      integration.handle(context),
    );
    expect(embedOf(effects).fields?.[0].value).toContain(
      "https://rc.home-assistant.io/integrations/hue/",
    );
  });

  it("answers ephemerally for unknown domains", async () => {
    const context = new CommandContext(
      commandEvent("integration", { integration: "doesnotexist" }),
      stubReader(),
    );
    const effects = await withRemote({ "www.home-assistant.io/integrations.json": HUE }, () =>
      integration.handle(context),
    );
    expect(effects).toEqual([
      { type: "reply", content: "Could not find information", ephemeral: true },
    ]);
  });

  it("suggests integrations by title and domain", async () => {
    const context = new DiscordContext(
      autocompleteEvent("integration", { option: "integration", value: "philips" }),
      stubReader(),
    );
    expect(
      await withRemote({ "www.home-assistant.io/integrations.json": HUE }, () =>
        integration.autocomplete ? integration.autocomplete(context) : Promise.resolve([]),
      ),
    ).toEqual([{ name: "Philips Hue", value: "hue" }]);
  });
});
