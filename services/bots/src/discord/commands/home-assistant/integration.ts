import { TransformPipe } from '@discord-nestjs/common';
import {
  DiscordTransformedCommand,
  Payload,
  TransformedCommandExecutionContext,
  Param,
  UsePipes,
} from '@discord-nestjs/core';
import { CommandHandler, DiscordCommandClass, OnDiscordEvent } from '../../discord.decorator';
import { AutocompleteInteraction, EmbedBuilder, Events, InteractionType } from 'discord.js';
import { Emoji } from '../../discord.const';
import { ServiceHomeassistantIntegrationData } from '../../services/home-assistant/integration-data';

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
export class CommandHomeassistantIntegration implements DiscordTransformedCommand<IntegrationDto> {
  constructor(private serviceHomeassistantIntegrationData: ServiceHomeassistantIntegrationData) {}

  @CommandHandler()
  async handler(
    @Payload() handlerDto: IntegrationDto,
    context: TransformedCommandExecutionContext,
  ): Promise<void> {
    const { domain } = handlerDto;
    const { interaction } = context;
    if (domain === 'reload') {
      await this.serviceHomeassistantIntegrationData.ensureData(true);

      await interaction.reply({
        content: 'Integration list reloaded',
        ephemeral: true,
      });
      return;
    }

    const integrationData = await this.serviceHomeassistantIntegrationData.getIntegration(domain);

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
  @OnDiscordEvent({
    event: Events.InteractionCreate,
    commandName: 'integration',
    interactionType: InteractionType.ApplicationCommandAutocomplete,
  })
  async onInteractionCreate(interaction: AutocompleteInteraction): Promise<void> {
    await this.serviceHomeassistantIntegrationData.ensureData();
    const focusedValue = interaction.options.getFocused()?.toLowerCase();

    await interaction.respond(
      focusedValue.length !== 0
        ? Object.entries(this.serviceHomeassistantIntegrationData.data)
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
  }
}
