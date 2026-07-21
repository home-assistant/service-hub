import { component } from "../commands/component.js";
import { commonCommands, commonListeners } from "./common.js";
import type { GuildManifest } from "./types.js";

export const esphomeGuild: GuildManifest = {
  id: "429907082951524364",
  name: "esphome",
  messageFile: "esphome.yaml",
  commands: [...commonCommands, component],
  listeners: [...commonListeners],
};
