import fetch from 'node-fetch';

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
import { Emoji } from '../discord.const';

const QualityScale = {
  no_score: 'No score',
  silver: `${Emoji.SECOND_PLACE} Silver`,
  gold: `${Emoji.FIRST_PLACE} Gold`,
  platinum: `${Emoji.TROPHY} Platinum`,
  internal: `${Emoji.HOUSE} Internal`,
};

class IntegrationDto {
  @Param({
    name: 'integration',
    description: 'What is the name of the integration?',
    required: true,
    autocomplete: true,
  })
  domain: string;
}

@DiscordCommandClass({
  name: 'integration',
  description: 'Returns information about an integration',
})
@UsePipes(TransformPipe)
export class IntegrationCommand implements DiscordTransformedCommand<IntegrationDto> {
  private integrationData: Record<string, Record<string, any>>;

  async reloadIntegrationData(force?: boolean): Promise<void> {
    if (force || !this.integrationData) {
      this.integrationData = await (
        await fetch('https://www.home-assistant.io/integrations.json')
      ).json();
    }
  }
  @CommandHandler()
  async handler(
    @Payload() handlerDto: IntegrationDto,
    context: TransformedCommandExecutionContext,
  ): Promise<void> {
    const { domain } = handlerDto;
    const { interaction } = context;
    if (domain === 'reload') {
      await this.reloadIntegrationData(true);

      await interaction.reply({
        content: 'Integration list reloaded',
        ephemeral: true,
      });
      return;
    }

    if (!this.integrationData[domain]) {
      await interaction.reply({
        content: `Could not find information for ${domain}`,
        ephemeral: true,
      });
      return;
    }

    await this.reloadIntegrationData();

    await interaction.reply({
      embeds: [
        new EmbedBuilder({
          title: this.integrationData[domain].title,
          thumbnail: { url: `https://brands.home-assistant.io/${domain}/dark_logo.png` },
          fields: [
            {
              name: 'Quality scale',
              value:
                QualityScale[this.integrationData[domain].quality_scale] || QualityScale.no_score,
              inline: true,
            },
            {
              name: 'IoT Class',
              value: this.integrationData[domain].iot_class || 'Unknown',
              inline: true,
            },
            {
              name: 'Documentation',
              value: `[View the documentation](https://www.home-assistant.io/integrations/${domain}/)`,
              inline: true,
            },
            {
              name: 'Source',
              value: `[View the source on GitHub](https://github.com/home-assistant/core/tree/dev/homeassistant/components/${domain})`,
              inline: true,
            },
            {
              name: 'Issues',
              value: `[View known issues](https://github.com/home-assistant/core/issues?q=is%3Aissue+is%3Aopen+label%3A%22integration%3A+${domain}%22)`,
              inline: true,
            },
          ],
        }),
      ],
    });
  }

  // This is the autocomplete handler for the /integration command
  @On('interactionCreate')
  async onInteractionCreate(interaction: AutocompleteInteraction): Promise<void> {
    if (!interaction.isAutocomplete() || interaction.commandName !== 'integration') {
      return;
    }
    try {
      await this.reloadIntegrationData();
      const focusedValue = interaction.options.getFocused()?.toLowerCase();

      await interaction.respond(
        focusedValue.length !== 0
          ? Object.entries(this.integrationData)
              .map(([domain, data]) => ({
                name: data.title,
                value: domain,
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
