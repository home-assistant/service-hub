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
import { IntegrationDataService } from '../services/integration-data';

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
  constructor(private integrationDataService: IntegrationDataService) {}

  @CommandHandler()
  async handler(
    @Payload() handlerDto: IntegrationDto,
    context: TransformedCommandExecutionContext,
  ): Promise<void> {
    const { domain } = handlerDto;
    const { interaction } = context;
    if (domain === 'reload') {
      await this.integrationDataService.ensureData(true);

      await interaction.reply({
        content: 'Integration list reloaded',
        ephemeral: true,
      });
      return;
    }

    const integrationData = await this.integrationDataService.getIntegration(domain);

    if (!integrationData) {
      await interaction.reply({
        content: 'Could not find information',
        ephemeral: true,
      });
      return;
    }
    await interaction.reply({
      embeds: [
        new EmbedBuilder({
          title: integrationData.title,
          thumbnail: { url: `https://brands.home-assistant.io/${domain}/dark_logo.png` },
          fields: [
            {
              name: 'Quality scale',
              value: QualityScale[integrationData.quality_scale] || QualityScale.no_score,
              inline: true,
            },
            {
              name: 'IoT Class',
              value: integrationData.iot_class || 'Unknown',
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
      await this.integrationDataService.ensureData();
      const focusedValue = interaction.options.getFocused()?.toLowerCase();

      await interaction.respond(
        focusedValue.length !== 0
          ? Object.entries(this.integrationDataService.data)
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
