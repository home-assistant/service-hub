import { log } from "../../log.js";
import type {
  AutocompleteChoice,
  DiscordEffect,
  Embed,
  FileAttachment,
  ModalSpec,
} from "./types.js";

/**
 * Answers to the triggering interaction. Implemented by the gateway adapter
 * over the live interaction object; absent for non-interaction events.
 */
export interface ResponderPort {
  reply(options: { content?: string; embeds?: Embed[]; ephemeral?: boolean }): Promise<void>;
  showModal(modal: ModalSpec): Promise<void>;
  autocomplete(choices: AutocompleteChoice[]): Promise<void>;
}

/** Explicitly-addressed channel operations. */
export interface ChannelPort {
  send(
    channelId: string,
    message: { content?: string; embeds?: Embed[]; files?: FileAttachment[] },
  ): Promise<void>;
  deleteMessage(channelId: string, messageId: string): Promise<void>;
}

export interface EffectPorts {
  responder?: ResponderPort;
  channels: ChannelPort;
}

/**
 * Apply dispatched effects through the ports. Sequential on purpose: replies
 * must land before follow-up channel operations, and effect lists are short.
 * A failure aborts the remaining effects — later ones can be destructive
 * follow-ups (deleting a message that should have been reposted first).
 */
export async function applyDiscordEffects(
  effects: DiscordEffect[],
  ports: EffectPorts,
  options: { dryRun?: boolean } = {},
): Promise<void> {
  if (options.dryRun) {
    log.info("discord: dry run", { effects: JSON.stringify(effects) });
    return;
  }

  for (const effect of effects) {
    try {
      switch (effect.type) {
        case "reply":
          await ports.responder?.reply(effect);
          break;
        case "showModal":
          await ports.responder?.showModal(effect.modal);
          break;
        case "autocomplete":
          await ports.responder?.autocomplete(effect.choices);
          break;
        case "sendMessage":
          await ports.channels.send(effect.channelId, effect);
          break;
        case "deleteMessage":
          await ports.channels.deleteMessage(effect.channelId, effect.messageId);
          break;
      }
    } catch (err) {
      log.warn("discord: effect failed, skipping the rest", {
        effect: effect.type,
        error: String(err),
      });
      return;
    }
  }
}
