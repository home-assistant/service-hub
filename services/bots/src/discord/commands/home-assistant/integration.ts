import { SlashCommandPipe } from '@discord-nestjs/common';
import { InteractionEvent, Param } from '@discord-nestjs/core';
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Events,
  InteractionType,
} from 'discord.js';
import { Emoji } from '../../discord.const';
import { CommandHandler, DiscordCommandClass, OnDiscordEvent } from '../../discord.decorator';
import { ServiceHomeassistantIntegrationData } from '../../services/home-assistant/integration-data';

const BETA_CHANNEL_ID = '427516175237382144';

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
export class CommandHomeassistantIntegration {
  constructor(private serviceHomeassistantIntegrationData: ServiceHomeassistantIntegrationData) {}

  @CommandHandler()
  async handler(
    @InteractionEvent(SlashCommandPipe) handlerDto: IntegrationDto,
    @InteractionEvent() interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const { domain } = handlerDto;
    const channel = interaction.channelId === BETA_CHANNEL_ID ? 'beta' : 'stable';

    if (domain === 'reload') {
      await this.serviceHomeassistantIntegrationData.ensureData(true, channel);

      await interaction.reply({
        content: 'Integration list reloaded',
        ephemeral: true,
      });
      return;
    }

    const integrationData = await this.serviceHomeassistantIntegrationData.getIntegration(
      domain,
      channel,
    );

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
          description: integrationData.description,
          thumbnail: { url: `https://brands.home-assistant.io/${domain}/dark_logo.png` },
          fields: [
            {
              name: 'Documentation',
              value: `[View the documentation](https://${
                channel === 'beta' ? 'rc' : 'www'
              }.home-assistant.io/integrations/${domain}/)`,
              inline: true,
            },
            {
              name: 'Quality scale',
              value: `[${
                QualityScale[integrationData.quality_scale] || QualityScale.no_score
              }](https://www.home-assistant.io/docs/quality_scale/)`,
              inline: true,
            },
            {
              name: 'IoT Class',
              value: `[${
                integrationData.iot_class || 'Unknown'
              }](https://developers.home-assistant.io/docs/creating_integration_manifest#iot-class)`,
              inline: true,
            },
            {
              name: 'Integration type',
              value: `[${integrationData.integration_type}](https://developers.home-assistant.io/docs/creating_integration_manifest#integration-type)`,
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
    const channel = interaction.channelId === BETA_CHANNEL_ID ? 'beta' : 'stable';
    await this.serviceHomeassistantIntegrationData.ensureData(false, channel);
    const focusedValue = interaction.options.getFocused()?.toLowerCase();

    await interaction.respond(
      focusedValue.length !== 0
        ? Object.entries(this.serviceHomeassistantIntegrationData.data[channel])
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
