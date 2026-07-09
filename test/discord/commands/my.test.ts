import { beforeEach, describe, expect, it } from "vitest";
import { my } from "../../../src/discord/commands/my.js";
import { CommandContext, DiscordContext } from "../../../src/discord/engine/context.js";
import { autocompleteEvent, commandEvent, modalEvent, stubReader } from "../helpers/events.js";
import { resetDataCaches, withRemote } from "../helpers/remote.js";

const REDIRECTS = [
  {
    redirect: "developer_template",
    name: "Template developer tools",
    description: "show your template developer tools",
  },
  {
    redirect: "config_flow_start",
    name: "Add integration",
    description: "start setting up a new integration",
    params: { domain: "string" },
  },
  {
    redirect: "old_thing",
    name: "Old thing",
    description: "deprecated",
    deprecated: true,
  },
];

const REMOTE = {
  "my.home-assistant.io/main/redirect.json": REDIRECTS,
  "www.home-assistant.io/integrations.json": { hue: { title: "Philips Hue", description: "" } },
};

beforeEach(resetDataCaches);

describe("/my", () => {
  it("links parameterless redirects directly", async () => {
    const context = new CommandContext(
      commandEvent("my", { redirect: "developer_template" }),
      stubReader(),
    );
    expect(await withRemote(REMOTE, () => my.handle(context))).toEqual([
      {
        type: "reply",
        embeds: [
          {
            title: "Template developer tools",
            description: "Open your Home Assistant instance and show your template developer tools",
            url: "https://my.home-assistant.io/redirect/developer_template/",
          },
        ],
      },
    ]);
  });

  it("collects params through a modal routed back via the my: prefix", async () => {
    const context = new CommandContext(
      commandEvent("my", { redirect: "config_flow_start" }),
      stubReader(),
    );
    expect(await withRemote(REMOTE, () => my.handle(context))).toEqual([
      {
        type: "showModal",
        modal: {
          customId: "my:config_flow_start",
          title: "Additional data",
          fields: [{ id: "domain", label: "domain", required: true }],
        },
      },
    ]);
  });

  it("marks params with a trailing ? optional in the modal", async () => {
    const remote = {
      ...REMOTE,
      "my.home-assistant.io/main/redirect.json": [
        { redirect: "x", name: "X", description: "", params: { mode: "string?" } },
      ],
    };
    const context = new CommandContext(commandEvent("my", { redirect: "x" }), stubReader());
    const effects = await withRemote(remote, () => my.handle(context));
    expect(effects).toEqual([
      {
        type: "showModal",
        modal: {
          customId: "my:x",
          title: "Additional data",
          fields: [{ id: "mode", label: "mode", required: false }],
        },
      },
    ]);
  });

  it("builds the redirect URL from modal fields and titles config flows", async () => {
    const context = new DiscordContext(
      modalEvent("my:config_flow_start", { domain: "hue" }),
      stubReader(),
    );
    expect(await withRemote(REMOTE, () => my.handleModal?.(context) ?? [])).toEqual([
      {
        type: "reply",
        embeds: [
          {
            title: "Add integration: Philips Hue",
            description: "start setting up a new integration",
            url: "https://my.home-assistant.io/redirect/config_flow_start/?domain=hue",
          },
        ],
      },
    ]);
  });

  it("hides deprecated redirects from autocomplete", async () => {
    const context = new DiscordContext(
      autocompleteEvent("my", { option: "redirect", value: "o" }),
      stubReader(),
    );
    const choices = await withRemote(REMOTE, () => my.autocomplete?.(context) ?? []);
    expect(choices.map((choice) => choice.value)).not.toContain("old_thing");
  });
});
