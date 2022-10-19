import { TransformPipe } from '@discord-nestjs/common';
import {
  DiscordTransformedCommand,
  Param,
  Payload,
  TransformedCommandExecutionContext,
  UsePipes,
} from '@discord-nestjs/core';
import { AutocompleteInteraction, EmbedBuilder, Events, InteractionType } from 'discord.js';
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
@UsePipes(TransformPipe)
export class CommandCommonMessage implements DiscordTransformedCommand<MessageDto> {
  constructor(private serviceCommonMessageData: ServiceCommonMessageData) {}

  @CommandHandler()
  async handler(
    @Payload() handlerDto: MessageDto,
    context: TransformedCommandExecutionContext,
  ): Promise<void> {
    const { messageKey, userMention } = handlerDto;
    const { interaction } = context;
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
