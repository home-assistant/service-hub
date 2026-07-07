import { describe, expect, it } from "bun:test";
import { message } from "../../../src/discord/commands/message.js";
import { ping } from "../../../src/discord/commands/ping.js";
import { buildCommandRegistrations } from "../../../src/discord/engine/register.js";

describe("buildCommandRegistrations", () => {
  it("maps option kinds onto Discord API option types", () => {
    expect(buildCommandRegistrations([ping, message])).toEqual([
      { name: "ping", description: "Returns pong", default_member_permissions: "2147483648" },
      {
        name: "message",
        description: "Returns a predefined message",
        default_member_permissions: "2147483648",
        options: [
          {
            type: 3,
            name: "message",
            description: "What message do you want to post?",
            required: true,
            autocomplete: true,
          },
          {
            type: 9,
            name: "user",
            description: "Tag the user you want the message to be posted for",
            required: false,
            autocomplete: false,
          },
        ],
      },
    ]);
  });
});
