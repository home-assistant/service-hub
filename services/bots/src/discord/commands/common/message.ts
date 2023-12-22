import { SlashCommandPipe } from '@discord-nestjs/common';
import { InteractionEvent, Param } from '@discord-nestjs/core';
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Events,
  InteractionType,
} from 'discord.js';
import { OptionalUserMentionDto } from '../../discord.const';
import { CommandHandler, DiscordCommandClass, OnDiscordEvent } from '../../discord.decorator';
import { ServiceCommonMessageData } from '../../services/common/message-data';

class MessageDto extends OptionalUserMentionDto {
  @Param({
    name: 'message',
    description: 'What message do you want to post?',
    required: true,
    autocomplete: true,
  })
  messageKey: string;
}

@DiscordCommandClass({
  name: 'message',
  description: 'Returns a predefined message',
})
export class CommandCommonMessage {
  constructor(private serviceCommonMessageData: ServiceCommonMessageData) {}

  @CommandHandler()
  async handler(
    @InteractionEvent(SlashCommandPipe) handlerDto: MessageDto,
    @InteractionEvent() interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const { messageKey, userMention } = handlerDto;
    if (messageKey === 'reload') {
      await this.serviceCommonMessageData.ensureData(interaction.guildId, true);

      await interaction.reply({
        content: 'Message list reloaded',
        ephemeral: true,
      });
      return;
    }

    const message = await this.serviceCommonMessageData.getMessage(interaction.guildId, messageKey);

    if (!message) {
      await interaction.reply({
        content: 'Could not find information',
        ephemeral: true,
      });
      return;
    }

    await this.serviceCommonMessageData.ensureData(interaction.guildId);

    await interaction.reply({
      embeds: [
        new EmbedBuilder({
          description: [userMention, message.content].join(' '),
          title: message.title,
          image: message.image ? { url: message.image } : undefined,
          fields: message.fields?.length
            ? message.fields.map((field) => ({ ...field, inline: true }))
            : undefined,
        }),
      ],
    });
  }

  // This is the autocomplete handler for the /message command
  @OnDiscordEvent({
    event: Events.InteractionCreate,
    commandName: 'message',
    interactionType: InteractionType.ApplicationCommandAutocomplete,
  })
  async onInteractionCreate(interaction: AutocompleteInteraction): Promise<void> {
    await this.serviceCommonMessageData.ensureData(interaction.guildId);
    const focusedValue = interaction.options.getFocused()?.toLowerCase();

    await interaction.respond(
      focusedValue.length !== 0
        ? Object.entries(this.serviceCommonMessageData.data)
            .filter(([_, data]) => data.description || data.title)
            .map(([key, data]) => ({
              name: data.description || data.title,
              value: key,
            }))
            .filter(
              (choice) =>
                choice.value.toLowerCase().includes(focusedValue) ||
                choice.name.toLowerCase().includes(focusedValue),
            )
            // The API only allow max 25 sugestions
            .slice(0, 25)
        : [],
    );
  }
}
