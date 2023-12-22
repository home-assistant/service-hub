import { SlashCommandPipe } from '@discord-nestjs/common';
import { InteractionEvent, Param } from '@discord-nestjs/core';
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Events,
  InteractionType,
} from 'discord.js';
import { CommandHandler, DiscordCommandClass, OnDiscordEvent } from '../../discord.decorator';
import {
  ServiceEsphomeComponentData,
  sourceWithFallback,
} from '../../services/esphome/component-data';

class ComponentsDto {
  @Param({
    name: 'component',
    description: 'What is the name of the component?',
    required: true,
    autocomplete: true,
  })
  component: string;
}

@DiscordCommandClass({
  name: 'component',
  description: 'Returns information about an component',
})
export class CommandEsphomeComponent {
  constructor(private serviceEsphomeComponentData: ServiceEsphomeComponentData) {}

  @CommandHandler()
  async handler(
    @InteractionEvent(SlashCommandPipe) handlerDto: ComponentsDto,
    @InteractionEvent() interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const { component } = handlerDto;
    const channel = interaction.channel.id;

    if (component === 'reload') {
      await this.serviceEsphomeComponentData.ensureData(channel, true);

      await interaction.reply({
        content: 'Component list reloaded',
        ephemeral: true,
      });
      return;
    }

    const componentData = await this.serviceEsphomeComponentData.getComponent(channel, component);

    if (!componentData) {
      await interaction.reply({
        content: 'Could not find information',
        ephemeral: true,
      });
      return;
    }
    await interaction.reply({
      embeds: [
        new EmbedBuilder({
          title: componentData.title,
          thumbnail: componentData.image ? { url: componentData.image } : undefined,
          fields: [
            {
              name: 'Documentation',
              value: `[View the documentation](${componentData.url})`,
              inline: true,
            },
            {
              name: 'Source',
              value: `[View the source on GitHub](https://github.com/esphome/esphome/tree/dev/esphome/${componentData.path})`,
              inline: true,
            },
          ],
        }),
      ],
    });
  }

  // This is the autocomplete handler for the /component command
  @OnDiscordEvent({
    event: Events.InteractionCreate,
    commandName: 'component',
    interactionType: InteractionType.ApplicationCommandAutocomplete,
  })
  async onInteractionCreate(interaction: AutocompleteInteraction): Promise<void> {
    const channel = interaction.channel.id;

    await this.serviceEsphomeComponentData.ensureData(channel);
    const focusedValue = interaction.options.getFocused()?.toLowerCase();

    await interaction.respond(
      focusedValue.length !== 0
        ? Object.entries(this.serviceEsphomeComponentData.data[sourceWithFallback(channel)])
            .map(([component, data]) => ({
              name: data.title,
              value: component,
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
