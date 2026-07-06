import { info } from "../commands/info.js";
import { message } from "../commands/message.js";
import { ping } from "../commands/ping.js";
import { pinned } from "../commands/pinned.js";
import { topic } from "../commands/topic.js";
import type { Listener, SlashCommand } from "../engine/types.js";
import { lineCountEnforcer } from "../listeners/line-count.js";

/** Spread into every guild manifest — commands available everywhere. */
export const commonCommands: SlashCommand[] = [info, message, ping, pinned, topic];

export const commonListeners: Listener[] = [lineCountEnforcer];
