import { integration } from "../commands/integration.js";
import { my } from "../commands/my.js";
import { versions } from "../commands/versions.js";
import { commonCommands, commonListeners } from "./common.js";
import type { GuildManifest } from "./types.js";

export const homeAssistantGuild: GuildManifest = {
  id: "330944238910963714",
  name: "home-assistant",
  commands: [...commonCommands, integration, my, versions],
  listeners: [...commonListeners],
};
