import fetch from 'node-fetch';
import yaml from 'js-yaml';

import { TransformPipe } from '@discord-nestjs/common';
import {
  DiscordTransformedCommand,
  Payload,
  TransformedCommandExecutionContext,
  Param,
  UsePipes,
  On,
} from '@discord-nestjs/core';
import { CommandHandler, DiscordCommandClass } from '../discord.decorator';
import { AutocompleteInteraction, EmbedBuilder } from 'discord.js';
import { reportException } from '@lib/sentry/reporting';
import { OptionalUserMentionDto } from '../discord.const';

const DATA_FILE_URL =
  'https://raw.githubusercontent.com/home-assistant/service-hub/main/data/discord_messages.yaml';

interface MessageData {
  [key: string]: {
    description?: string;
    content: string;
    image?: string;
    title?: string;
  };
}

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
export class MessageCommand implements DiscordTransformedCommand<MessageDto> {
  private messageData: MessageData;

  async ensureMessageDataLoaded(force?: boolean): Promise<void> {
    if (force || !this.messageData) {
      this.messageData = yaml.load(await (await fetch(DATA_FILE_URL)).text(), {
        json: true,
      }) as MessageData;
    }
  }
  @CommandHandler()
  async handler(
    @Payload() handlerDto: MessageDto,
    context: TransformedCommandExecutionContext,
  ): Promise<void> {
    const { messageKey, userMention } = handlerDto;
    const { interaction } = context;
    if (messageKey === 'reload') {
      await this.ensureMessageDataLoaded(true);

      await interaction.reply({
        content: 'Message list reloaded',
        ephemeral: true,
      });
      return;
    }

    if (!this.messageData[messageKey]) {
      await interaction.reply({
        content: 'Could not find information',
        ephemeral: true,
      });
      return;
    }

    await this.ensureMessageDataLoaded();

    console.log(this.messageData[messageKey]);

    await interaction.reply({
      embeds: [
        new EmbedBuilder({
          description: [userMention, this.messageData[messageKey].content].join(' '),
          title: this.messageData[messageKey].title,
          image: this.messageData[messageKey].image
            ? { url: this.messageData[messageKey].image }
            : undefined,
        }),
      ],
    });
  }

  // This is the autocomplete handler for the /message command
  @On('interactionCreate')
  async onInteractionCreate(interaction: AutocompleteInteraction): Promise<void> {
    if (!interaction.isAutocomplete() || interaction.commandName !== 'message') {
      return;
    }
    try {
      await this.ensureMessageDataLoaded();
      const focusedValue = interaction.options.getFocused()?.toLowerCase();

      if (interaction.responded) {
        // this happens up upgrades when 2 bots run at the same time
        return;
      }

      await interaction.respond(
        focusedValue.length !== 0
          ? Object.entries(this.messageData)
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
    } catch (err) {
      reportException(err, {
        cause: err,
        data: {
          interaction: interaction.toJSON(),
          user: interaction.user.toJSON(),
          channel: interaction.channel.toJSON(),
          command: interaction.command.toJSON(),
        },
      });
      await interaction.respond([]);
    }
  }
}
