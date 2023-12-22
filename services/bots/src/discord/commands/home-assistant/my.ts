import { SlashCommandPipe } from '@discord-nestjs/common';
import { InteractionEvent, Param } from '@discord-nestjs/core';
import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Events,
  ModalActionRowComponentBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { CommandHandler, DiscordCommandClass, OnDiscordEvent } from '../../discord.decorator';
import {
  IntegrationData,
  ServiceHomeassistantIntegrationData,
} from '../../services/home-assistant/integration-data';
import { ServiceHomeassistantMyRedirectData } from '../../services/home-assistant/my-redirect-data';

class MyDto {
  @Param({
    name: 'redirect',
    description: 'What is the name of the redirect?',
    required: true,
    autocomplete: true,
  })
  redirect: string;
}

@DiscordCommandClass({
  name: 'my',
  description: 'Returns a my link',
})
export class CommandHomeAssistantMy {
  constructor(
    private serviceHomeassistantIntegrationData: ServiceHomeassistantIntegrationData,
    private serviceHomeassistantMyRedirectData: ServiceHomeassistantMyRedirectData,
  ) {}

  @CommandHandler()
  async handler(
    @InteractionEvent(SlashCommandPipe) handlerDto: MyDto,
    @InteractionEvent() interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const { redirect } = handlerDto;
    if (redirect === 'reload') {
      await this.serviceHomeassistantMyRedirectData.ensureData(true);

      await interaction.reply({
        content: 'My redirect list reloaded',
        ephemeral: true,
      });
      return;
    }

    const redirectData = await this.serviceHomeassistantMyRedirectData.getRedirect(redirect);

    if (!redirectData) {
      await interaction.reply({
        content: 'Could not find information',
        ephemeral: true,
      });
      return;
    }

    if (redirectData.params) {
      await interaction.showModal(
        new ModalBuilder({
          title: 'Additional data',
          customId: redirectData.redirect,
          components: Object.entries(redirectData.params).map(([key, keyType]) =>
            new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
              new TextInputBuilder({
                custom_id: key,
                label: key,
                required: !keyType.includes('?'),
                style: TextInputStyle.Short,
              }),
            ),
          ),
        }),
      );
      return;
    }

    await interaction.reply({
      embeds: [
        new EmbedBuilder({
          title: redirectData.name,
          description: `Open your Home Assistant instance and ${redirectData.description}`,
          url: `https://my.home-assistant.io/redirect/${redirectData.redirect}/`,
        }),
      ],
    });
  }

  @OnDiscordEvent({ event: Events.InteractionCreate })
  async onInteractionCreate(
    interaction: AutocompleteInteraction | ModalSubmitInteraction,
  ): Promise<void> {
    // This is the autocomplete handler for the /my command
    if (interaction.isAutocomplete() && interaction.commandName === 'my') {
      await this.serviceHomeassistantMyRedirectData.ensureData();
      const focusedValue = interaction.options.getFocused()?.toLowerCase();

      await interaction.respond(
        focusedValue.length !== 0
          ? this.serviceHomeassistantMyRedirectData.data
              .filter((redirect) => !redirect.deprecated)
              .map((redirect) => ({
                name: redirect.name,
                value: redirect.redirect,
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
    } // This is modal submition handler if the redirect supports params
    else if (interaction.isModalSubmit()) {
      const redirectData = await this.serviceHomeassistantMyRedirectData.getRedirect(
        interaction.customId,
      );
      const domainField = interaction.fields.fields.get('domain');
      let integrationData: IntegrationData;

      if (domainField) {
        integrationData = await this.serviceHomeassistantIntegrationData.getIntegration(
          domainField.value,
        );
      }

      const url = new URL(`https://my.home-assistant.io/redirect/${redirectData.redirect}/`);
      for (const field of interaction.fields.fields.values()) {
        url.searchParams.set(field.customId, field.value);
      }
      await interaction.reply({
        embeds: [
          new EmbedBuilder({
            title:
              domainField && redirectData.redirect === 'config_flow_start'
                ? `Add integration: ${integrationData?.title || domainField}`
                : redirectData.name,
            description: redirectData.description,
            url: url.toString(),
          }),
        ],
      });
    }
  }
}
