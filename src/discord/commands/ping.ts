import type { SlashCommand } from "../engine/types.js";

export const ping: SlashCommand = {
  name: "ping",
  description: "Returns pong",

  async handle() {
    return [{ type: "reply" as const, content: "pong" }];
  },
};
